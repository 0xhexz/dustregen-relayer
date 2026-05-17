import { DustUtxoPool, UTXO_SPLIT_AMOUNT, PoolExhaustedError, UtxoRef } from '../wallet/utxo-pool';
import { DustUtxoSplitter } from '../wallet/utxo-splitter';
import { PoolAllocator } from '../queue/pool-allocator';

function createMockReplenishFn(count = 50): jest.Mock<Promise<UtxoRef[]>> {
  let callCount = 0;
  return jest.fn(async () => {
    callCount++;
    const refs: UtxoRef[] = [];
    for (let i = 0; i < count; i++) {
      refs.push({ utxoId: `replenish-${callCount}-${i}`, amount: UTXO_SPLIT_AMOUNT });
    }
    return refs;
  });
}

function createTestUtxos(count: number): UtxoRef[] {
  return Array.from({ length: count }, (_, i) => ({
    utxoId: `test-utxo-${i}`,
    amount: UTXO_SPLIT_AMOUNT,
  }));
}

describe('DustUtxoPool', () => {
  describe('acquire/release', () => {
    test('acquire returns a UTXO from the pool', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());
      pool.seed(createTestUtxos(5));

      const utxo = pool.acquire();
      expect(utxo).toBeDefined();
      expect(utxo.utxoId).toMatch(/^test-utxo-/);
      expect(utxo.amount).toBe(UTXO_SPLIT_AMOUNT);
    });

    test('acquire removes UTXO from available pool', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());
      pool.seed(createTestUtxos(3));

      expect(pool.getAvailableCount()).toBe(3);
      pool.acquire();
      expect(pool.getAvailableCount()).toBe(2);
    });

    test('release returns UTXO back to the pool', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());
      pool.seed(createTestUtxos(2));

      const utxo = pool.acquire();
      expect(pool.getAvailableCount()).toBe(1);
      pool.release(utxo.utxoId);
      expect(pool.getAvailableCount()).toBe(2);
    });

    test('each acquire returns a unique UTXO', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());
      pool.seed(createTestUtxos(5));

      const acquired = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const utxo = pool.acquire();
        expect(acquired.has(utxo.utxoId)).toBe(false);
        acquired.add(utxo.utxoId);
      }
      expect(acquired.size).toBe(5);
    });
  });

  describe('pool exhaustion', () => {
    test('throws PoolExhaustedError when pool is empty', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());

      expect(() => pool.acquire()).toThrow(PoolExhaustedError);
    });

    test('throws PoolExhaustedError after all UTXOs are acquired', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());
      pool.seed(createTestUtxos(2));

      pool.acquire();
      pool.acquire();
      expect(() => pool.acquire()).toThrow(PoolExhaustedError);
    });

    test('PoolExhaustedError has correct httpStatus', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());

      try {
        pool.acquire();
      } catch (err) {
        expect(err).toBeInstanceOf(PoolExhaustedError);
        expect((err as PoolExhaustedError).httpStatus).toBe(503);
        expect((err as PoolExhaustedError).code).toBe('PoolExhaustedError');
      }
    });
  });

  describe('replenish', () => {
    test('replenish adds new UTXOs to the pool', async () => {
      const replenishFn = createMockReplenishFn(50);
      const pool = new DustUtxoPool(replenishFn);

      expect(pool.getAvailableCount()).toBe(0);
      await pool.replenish();
      expect(pool.getAvailableCount()).toBe(50);
      expect(replenishFn).toHaveBeenCalledTimes(1);
    });

    test('replenish can be called multiple times', async () => {
      const replenishFn = createMockReplenishFn(10);
      const pool = new DustUtxoPool(replenishFn);

      await pool.replenish();
      expect(pool.getAvailableCount()).toBe(10);
      await pool.replenish();
      // New UTXOs have different IDs so they add to the pool
      expect(pool.getAvailableCount()).toBe(20);
    });
  });

  describe('getAvailableCount', () => {
    test('returns 0 for empty pool', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());
      expect(pool.getAvailableCount()).toBe(0);
    });

    test('returns correct count after seeding', () => {
      const pool = new DustUtxoPool(createMockReplenishFn());
      pool.seed(createTestUtxos(15));
      expect(pool.getAvailableCount()).toBe(15);
    });
  });
});

describe('DustUtxoSplitter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('triggers replenish when pool is below threshold', async () => {
    const replenishFn = createMockReplenishFn(50);
    const pool = new DustUtxoPool(replenishFn);
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    // Pool has fewer than 10 UTXOs (threshold)
    pool.seed(createTestUtxos(5));

    const splitter = new DustUtxoSplitter(pool, 1000, logger);
    splitter.start();

    // Advance timer to trigger tick
    jest.advanceTimersByTime(1000);

    // Allow async tick to complete
    await Promise.resolve();
    await Promise.resolve();

    expect(replenishFn).toHaveBeenCalledTimes(1);
    splitter.stop();
  });

  test('does not trigger replenish when pool is above threshold', () => {
    const replenishFn = createMockReplenishFn(50);
    const pool = new DustUtxoPool(replenishFn);
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    // Pool has more than 10 UTXOs (threshold)
    pool.seed(createTestUtxos(15));

    const splitter = new DustUtxoSplitter(pool, 1000, logger);
    splitter.start();

    jest.advanceTimersByTime(1000);

    expect(replenishFn).not.toHaveBeenCalled();
    splitter.stop();
  });

  test('stop halts monitoring', () => {
    const replenishFn = createMockReplenishFn(50);
    const pool = new DustUtxoPool(replenishFn);
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    pool.seed(createTestUtxos(3)); // Below threshold

    const splitter = new DustUtxoSplitter(pool, 1000, logger);
    splitter.start();
    splitter.stop();

    jest.advanceTimersByTime(5000);
    expect(replenishFn).not.toHaveBeenCalled();
  });
});

describe('PoolAllocator', () => {
  test('runExclusive satisfies ISponsorMutex interface', async () => {
    const pool = new DustUtxoPool(createMockReplenishFn());
    pool.seed(createTestUtxos(5));
    const logger = { info: jest.fn(), warn: jest.fn() };

    const allocator = new PoolAllocator(pool, logger);

    const result = await allocator.runExclusive('test', async () => {
      return 'hello';
    });

    expect(result).toBe('hello');
  });

  test('runExclusive allocates and releases UTXO', async () => {
    const pool = new DustUtxoPool(createMockReplenishFn());
    pool.seed(createTestUtxos(3));
    const logger = { info: jest.fn(), warn: jest.fn() };

    const allocator = new PoolAllocator(pool, logger);

    expect(pool.getAvailableCount()).toBe(3);

    await allocator.runExclusive('test', async () => {
      // During execution, one UTXO is acquired
      expect(pool.getAvailableCount()).toBe(2);
    });

    // After execution, UTXO is released back
    expect(pool.getAvailableCount()).toBe(3);
  });

  test('runExclusive releases UTXO even on error', async () => {
    const pool = new DustUtxoPool(createMockReplenishFn());
    pool.seed(createTestUtxos(3));
    const logger = { info: jest.fn(), warn: jest.fn() };

    const allocator = new PoolAllocator(pool, logger);

    await expect(
      allocator.runExclusive('test', async () => {
        throw new Error('deliberate failure');
      })
    ).rejects.toThrow('deliberate failure');

    // UTXO should still be released
    expect(pool.getAvailableCount()).toBe(3);
  });

  test('enables concurrent allocation with separate UTXOs', async () => {
    const pool = new DustUtxoPool(createMockReplenishFn());
    pool.seed(createTestUtxos(5));
    const logger = { info: jest.fn(), warn: jest.fn() };

    const allocator = new PoolAllocator(pool, logger);

    // Run 3 concurrent operations
    const results = await Promise.all([
      allocator.runExclusive('req-1', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'result-1';
      }),
      allocator.runExclusive('req-2', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'result-2';
      }),
      allocator.runExclusive('req-3', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'result-3';
      }),
    ]);

    expect(results).toEqual(['result-1', 'result-2', 'result-3']);
    // All UTXOs released back to pool
    expect(pool.getAvailableCount()).toBe(5);
  });

  test('acquireUtxo/releaseUtxo work correctly', async () => {
    const pool = new DustUtxoPool(createMockReplenishFn());
    pool.seed(createTestUtxos(3));
    const logger = { info: jest.fn(), warn: jest.fn() };

    const allocator = new PoolAllocator(pool, logger);

    const allocation = await allocator.acquireUtxo('req-1');
    expect(allocation.utxoId).toBeDefined();
    expect(allocation.amount).toBe(UTXO_SPLIT_AMOUNT);
    expect(pool.getAvailableCount()).toBe(2);

    await allocator.releaseUtxo('req-1');
    expect(pool.getAvailableCount()).toBe(3);
  });

  test('pending count tracks active operations', async () => {
    const pool = new DustUtxoPool(createMockReplenishFn());
    pool.seed(createTestUtxos(5));
    const logger = { info: jest.fn(), warn: jest.fn() };

    const allocator = new PoolAllocator(pool, logger);
    expect(allocator.pending).toBe(0);

    let resolveFn: () => void;
    const blockingPromise = new Promise<void>((r) => { resolveFn = r; });

    const execPromise = allocator.runExclusive('test', () => blockingPromise);

    // Allow microtask to proceed
    await Promise.resolve();
    expect(allocator.pending).toBe(1);

    resolveFn!();
    await execPromise;
    expect(allocator.pending).toBe(0);
  });
});
