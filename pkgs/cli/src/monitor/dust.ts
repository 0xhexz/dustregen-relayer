import { interval, Subscription, map } from 'rxjs';
import { sendWebhookAlert } from './webhooks';

// Battery model constants
export const STARS_PER_NIGHT = 1_000_000n;
export const SPECKS_PER_DUST = 1_000_000_000_000_000n;
export const REGEN_SPECKS_PER_STAR_PER_SEC = 8_267n;
export const DUST_CAP_PER_NIGHT_IN_SPECKS = 5n * SPECKS_PER_DUST;
export const LOW_DUST_THRESHOLD_SPECKS = SPECKS_PER_DUST / 2n;

export interface DustSnapshot {
  readonly takenAt: Date;
  readonly nightStars: bigint;
  readonly dustSpecks: bigint;
  readonly dustCapacitySpecks: bigint;
  readonly capacityPct: number;
  readonly regenSpecksPerSecond: bigint;
}

export interface AutoRefillOpts {
  submitRefillTx: () => Promise<string>;
  getNightBalance: () => bigint;
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void };
}

export function computeDustCapacity(nightStars: bigint): bigint {
  return (DUST_CAP_PER_NIGHT_IN_SPECKS * nightStars) / STARS_PER_NIGHT;
}

export function computeRegenRate(nightStars: bigint): bigint {
  return REGEN_SPECKS_PER_STAR_PER_SEC * nightStars;
}

export function projectDust(currentDustSpecks: bigint, nightStars: bigint, elapsedSeconds: bigint): bigint {
  const regen = REGEN_SPECKS_PER_STAR_PER_SEC * nightStars * elapsedSeconds;
  const capacity = computeDustCapacity(nightStars);
  const projected = currentDustSpecks + regen;
  return projected > capacity ? capacity : projected;
}

export function computeCapacityPct(dustSpecks: bigint, nightStars: bigint): number {
  if (nightStars === 0n) return 0;
  const capacity = computeDustCapacity(nightStars);
  if (capacity === 0n) return 0;
  return Number(dustSpecks * 10000n / capacity) / 10000;
}

export function isLowDust(dustSpecks: bigint): boolean {
  return dustSpecks < LOW_DUST_THRESHOLD_SPECKS;
}

/**
 * Compute G_dust(t) = min(5 * V_NIGHT, R_g * V_Star * delta_t)
 * where V_NIGHT is in stars, R_g is REGEN_SPECKS_PER_STAR_PER_SEC, delta_t is seconds since last refill
 */
export function computeRefillAmount(nightStars: bigint, deltaSeconds: bigint): bigint {
  const maxRefill = 5n * nightStars * SPECKS_PER_DUST / STARS_PER_NIGHT;
  const regenRefill = REGEN_SPECKS_PER_STAR_PER_SEC * nightStars * deltaSeconds;
  return maxRefill < regenRefill ? maxRefill : regenRefill;
}

const ALERT_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_SPIKE_THRESHOLD = 30;
const REFILL_COOLDOWN_MS = 60_000; // 60 seconds cooldown between refill attempts

export class DustMonitor {
  private subscription: Subscription | null = null;
  private snapshot: DustSnapshot | null = null;
  private logger: { warn: (msg: string, data?: unknown) => void };
  private getWalletState: () => { nightStars: bigint; dustSpecks: bigint } | null;
  private requestTimestamps: number[] = [];
  private lastAlertSent: Map<string, number> = new Map();
  private autoRefillOpts: AutoRefillOpts | null = null;
  private lastRefillAttempt: number = 0;
  private lastRefillTime: number = 0;

  constructor(
    getWalletState: () => { nightStars: bigint; dustSpecks: bigint } | null,
    logger: { warn: (msg: string, data?: unknown) => void }
  ) {
    this.getWalletState = getWalletState;
    this.logger = logger;
  }

  recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  enableAutoRefill(opts: AutoRefillOpts): void {
    this.autoRefillOpts = opts;
    this.lastRefillTime = Date.now();
  }

  disableAutoRefill(): void {
    this.autoRefillOpts = null;
  }

  private canSendAlert(type: string): boolean {
    const lastSent = this.lastAlertSent.get(type);
    if (!lastSent) return true;
    return Date.now() - lastSent >= ALERT_DEBOUNCE_MS;
  }

  private markAlertSent(type: string): void {
    this.lastAlertSent.set(type, Date.now());
  }

  private async attemptAutoRefill(dustSpecks: bigint): Promise<void> {
    if (!this.autoRefillOpts) return;

    const now = Date.now();
    if (now - this.lastRefillAttempt < REFILL_COOLDOWN_MS) {
      return; // Cooldown active, skip
    }

    if (!isLowDust(dustSpecks)) return;

    this.lastRefillAttempt = now;
    const { submitRefillTx, getNightBalance, logger } = this.autoRefillOpts;

    try {
      const nightBalance = getNightBalance();
      const deltaSeconds = BigInt(Math.floor((now - this.lastRefillTime) / 1000));
      const refillAmount = computeRefillAmount(nightBalance, deltaSeconds);

      logger.info('Attempting auto-refill', {
        dustSpecks: dustSpecks.toString(),
        refillAmount: refillAmount.toString(),
        deltaSeconds: deltaSeconds.toString(),
      });

      const txId = await submitRefillTx();
      this.lastRefillTime = now;

      logger.info('Auto-refill submitted successfully', { txId });
    } catch (err) {
      logger.warn('Auto-refill failed', { error: (err as Error).message });
    }
  }

  start(intervalMs: number = 10_000): void {
    this.subscription = interval(intervalMs).pipe(
      map(() => this.getWalletState()),
    ).subscribe(state => {
      // Prune request timestamps older than 5 minutes
      const cutoff = Date.now() - REQUEST_WINDOW_MS;
      this.requestTimestamps = this.requestTimestamps.filter(ts => ts > cutoff);

      // Check for request spike (runs regardless of wallet state)
      if (this.requestTimestamps.length > REQUEST_SPIKE_THRESHOLD) {
        if (this.canSendAlert('request_spike')) {
          this.markAlertSent('request_spike');
          sendWebhookAlert({
            type: 'request_spike',
            message: `Request spike detected: ${this.requestTimestamps.length} requests in last 5 minutes`,
            details: { requestCount: this.requestTimestamps.length, windowMs: REQUEST_WINDOW_MS },
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (!state) return;
      const { nightStars, dustSpecks } = state;
      const capacity = computeDustCapacity(nightStars);
      this.snapshot = {
        takenAt: new Date(),
        nightStars,
        dustSpecks,
        dustCapacitySpecks: capacity,
        capacityPct: computeCapacityPct(dustSpecks, nightStars),
        regenSpecksPerSecond: computeRegenRate(nightStars),
      };
      if (isLowDust(dustSpecks)) {
        this.logger.warn('LowDustBalance', { dustSpecks: dustSpecks.toString(), threshold: LOW_DUST_THRESHOLD_SPECKS.toString() });
        if (this.canSendAlert('low_dust')) {
          this.markAlertSent('low_dust');
          sendWebhookAlert({
            type: 'low_dust',
            message: `DUST balance is below threshold: ${dustSpecks.toString()} specks`,
            details: { dustSpecks: dustSpecks.toString(), threshold: LOW_DUST_THRESHOLD_SPECKS.toString() },
            timestamp: new Date().toISOString(),
          });
        }

        // Attempt auto-refill if enabled (catch unhandled rejections from the async call)
        this.attemptAutoRefill(dustSpecks).catch((err) => {
          this.logger.warn('Unhandled error in auto-refill attempt', { error: (err as Error).message });
        });
      }
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  current(): DustSnapshot | null {
    return this.snapshot;
  }
}
