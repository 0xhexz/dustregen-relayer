import { interval, Subscription, map } from 'rxjs';

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

export class DustMonitor {
  private subscription: Subscription | null = null;
  private snapshot: DustSnapshot | null = null;
  private logger: { warn: (msg: string, data?: unknown) => void };
  private getWalletState: () => { nightStars: bigint; dustSpecks: bigint } | null;

  constructor(
    getWalletState: () => { nightStars: bigint; dustSpecks: bigint } | null,
    logger: { warn: (msg: string, data?: unknown) => void }
  ) {
    this.getWalletState = getWalletState;
    this.logger = logger;
  }

  start(intervalMs: number = 10_000): void {
    this.subscription = interval(intervalMs).pipe(
      map(() => this.getWalletState()),
    ).subscribe(state => {
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
