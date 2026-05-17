import { ISponsorMutex, IPoolAllocator, UtxoAllocation } from './mutex';
import { DustUtxoPool } from '../wallet/utxo-pool';

export interface AllocatorLogger {
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
}

/**
 * Pool-based allocator that implements both ISponsorMutex (backward compat)
 * and IPoolAllocator. Instead of a global lock, each request acquires its
 * own UTXO from the pool, enabling parallel sponsor processing.
 */
export class PoolAllocator implements ISponsorMutex, IPoolAllocator {
  private _pending = 0;
  private allocations: Map<string, UtxoAllocation> = new Map();

  constructor(
    private readonly pool: DustUtxoPool,
    private readonly logger: AllocatorLogger,
  ) {}

  /**
   * ISponsorMutex-compatible: allocate a UTXO, run the function, then release.
   * This enables parallel execution since each call gets its own UTXO.
   */
  async runExclusive<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this._pending++;
    this.logger.info('pool-allocator:acquire', { label, pending: this._pending });

    const utxoRef = this.pool.acquire();
    try {
      const result = await fn();
      return result;
    } finally {
      this.pool.release(utxoRef.utxoId);
      this._pending--;
      this.logger.info('pool-allocator:release', { label, utxoId: utxoRef.utxoId });
    }
  }

  get pending(): number {
    return this._pending;
  }

  /**
   * IPoolAllocator: acquire a UTXO allocation for a specific request.
   */
  async acquireUtxo(requestId: string): Promise<UtxoAllocation> {
    const utxoRef = this.pool.acquire();
    const allocation: UtxoAllocation = { utxoId: utxoRef.utxoId, amount: utxoRef.amount };
    this.allocations.set(requestId, allocation);
    this.logger.info('pool-allocator:acquireUtxo', { requestId, utxoId: utxoRef.utxoId });
    return allocation;
  }

  /**
   * IPoolAllocator: release a previously acquired UTXO allocation.
   */
  async releaseUtxo(requestId: string): Promise<void> {
    const allocation = this.allocations.get(requestId);
    if (allocation) {
      this.pool.release(allocation.utxoId);
      this.allocations.delete(requestId);
      this.logger.info('pool-allocator:releaseUtxo', { requestId, utxoId: allocation.utxoId });
    }
  }
}
