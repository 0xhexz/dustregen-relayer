import { RelayerError } from '../errors.js';

/** Each pre-split UTXO is 0.1 DUST = 10^14 Specks */
export const UTXO_SPLIT_AMOUNT = 100_000_000_000_000n;

/** Default number of UTXOs to create per replenish operation */
export const REPLENISH_COUNT = 50;

export interface UtxoRef {
  readonly utxoId: string;
  readonly amount: bigint;
}

export class PoolExhaustedError extends RelayerError {
  readonly code = 'PoolExhaustedError' as const;
  readonly httpStatus = 503;
  /** Suggested number of seconds the client should wait before retrying */
  readonly retryAfterSeconds: number;
  /** Current queue depth (number of pending requests) */
  readonly queueDepth: number;

  constructor(message: string, opts?: { retryAfterSeconds?: number; queueDepth?: number }) {
    super(message, {
      retryAfterSeconds: opts?.retryAfterSeconds ?? 5,
      queueDepth: opts?.queueDepth ?? 0,
    });
    this.retryAfterSeconds = opts?.retryAfterSeconds ?? 5;
    this.queueDepth = opts?.queueDepth ?? 0;
  }
}

export type ReplenishFn = () => Promise<UtxoRef[]>;

/**
 * In-memory pool of pre-split UTXO references for parallel sponsor processing.
 * Each UTXO represents 0.1 DUST (10^14 Specks).
 */
export class DustUtxoPool {
  private available: Map<string, UtxoRef> = new Map();
  private readonly replenishFn: ReplenishFn;

  constructor(replenishFn: ReplenishFn) {
    this.replenishFn = replenishFn;
  }

  /**
   * Acquire a unique unspent UTXO from the pool.
   * Throws PoolExhaustedError if no UTXOs are available.
   */
  acquire(): UtxoRef {
    const iter = this.available.entries().next();
    if (iter.done) {
      throw new PoolExhaustedError('UTXO pool exhausted - no available UTXOs for sponsor request');
    }
    const [utxoId, ref] = iter.value;
    this.available.delete(utxoId);
    return ref;
  }

  /**
   * Return an unused UTXO back to the pool.
   */
  release(utxoId: string): void {
    const ref: UtxoRef = { utxoId, amount: UTXO_SPLIT_AMOUNT };
    this.available.set(utxoId, ref);
  }

  /**
   * Get the number of currently available UTXOs.
   */
  getAvailableCount(): number {
    return this.available.size;
  }

  /**
   * Execute a self-spend splitting a large UTXO into multiple smaller ones.
   * Calls the injected replenish function and adds results to the pool.
   */
  async replenish(): Promise<void> {
    const newUtxos = await this.replenishFn();
    for (const ref of newUtxos) {
      this.available.set(ref.utxoId, ref);
    }
  }

  /**
   * Seed pool with initial UTXO references (e.g., on startup).
   */
  seed(refs: UtxoRef[]): void {
    for (const ref of refs) {
      this.available.set(ref.utxoId, ref);
    }
  }
}
