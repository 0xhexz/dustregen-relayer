import { DustUtxoPool } from './utxo-pool.js';

/** Default threshold below which replenishment is triggered */
export const LOW_POOL_THRESHOLD = 10;

export interface SplitterLogger {
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
}

/**
 * Background daemon that monitors the UTXO pool and triggers
 * replenishment when available UTXOs drop below a threshold.
 */
export class DustUtxoSplitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private replenishing = false;

  constructor(
    private readonly pool: DustUtxoPool,
    private readonly pollingIntervalMs: number,
    private readonly logger: SplitterLogger,
    private readonly threshold: number = LOW_POOL_THRESHOLD,
  ) {}

  /**
   * Start the monitoring interval.
   */
  start(): void {
    if (this.timer) return;
    this.logger.info('utxo-splitter:start', { pollingIntervalMs: this.pollingIntervalMs, threshold: this.threshold });
    this.timer = setInterval(() => this.tick(), this.pollingIntervalMs);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('utxo-splitter:stop');
    }
  }

  /**
   * Single tick: check pool level and replenish if below threshold.
   */
  private async tick(): Promise<void> {
    if (this.replenishing) return;

    const available = this.pool.getAvailableCount();
    if (available < this.threshold) {
      this.replenishing = true;
      this.logger.info('utxo-splitter:replenish:start', { available, threshold: this.threshold });
      try {
        await this.pool.replenish();
        this.logger.info('utxo-splitter:replenish:done', { available: this.pool.getAvailableCount() });
      } catch (err) {
        this.logger.error('utxo-splitter:replenish:error', { error: (err as Error).message });
      } finally {
        this.replenishing = false;
      }
    }
  }
}
