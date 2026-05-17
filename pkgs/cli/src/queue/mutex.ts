import { Mutex } from 'async-mutex';
import { Redis } from 'ioredis';
import Redlock from 'redlock';

export interface ISponsorMutex {
  runExclusive<T>(label: string, fn: () => Promise<T>): Promise<T>;
  readonly pending: number;
}

export interface UtxoAllocation {
  utxoId: string;
  amount: bigint;
}

export interface IPoolAllocator {
  acquireUtxo(requestId: string): Promise<UtxoAllocation>;
  releaseUtxo(requestId: string): Promise<void>;
}

export class SponsorMutex implements ISponsorMutex {
  private readonly mutex = new Mutex();
  private _pending = 0;
  private logger: { info: (msg: string, data?: unknown) => void };

  constructor(logger?: { info: (msg: string, data?: unknown) => void }) {
    this.logger = logger || { info: () => {} };
  }

  async runExclusive<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this._pending++;
    const startWait = Date.now();
    this.logger.info('mutex:acquire:wait', { label, pending: this._pending });

    try {
      return await this.mutex.runExclusive(async () => {
        const waitTime = Date.now() - startWait;
        this.logger.info('mutex:acquired', { label, waitMs: waitTime });
        try {
          return await fn();
        } finally {
          this.logger.info('mutex:release', { label });
        }
      });
    } finally {
      this._pending--;
    }
  }

  get pending(): number {
    return this._pending;
  }
}

export class DistributedSponsorMutex implements ISponsorMutex {
  private readonly redlock: Redlock;
  private readonly lockKey = 'locks:sponsor:utxo-spend';
  private readonly ttl = 30000;
  private _pending = 0;
  private logger: { info: (msg: string, data?: unknown) => void };

  constructor(redisUrl: string, logger?: { info: (msg: string, data?: unknown) => void }) {
    this.logger = logger || { info: () => {} };
    const client = new Redis(redisUrl);
    this.redlock = new Redlock([client as any], {
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 100,
    });
  }

  async runExclusive<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this._pending++;
    const startWait = Date.now();
    this.logger.info('mutex:acquire:wait', { label, pending: this._pending });

    try {
      const lock = await this.redlock.lock(this.lockKey, this.ttl);
      const waitTime = Date.now() - startWait;
      this.logger.info('mutex:acquired', { label, waitMs: waitTime });

      try {
        return await fn();
      } finally {
        this.logger.info('mutex:release', { label });
        await lock.unlock();
      }
    } finally {
      this._pending--;
    }
  }

  get pending(): number {
    return this._pending;
  }
}

export function createSponsorMutex(
  logger: { info: (msg: string, data?: unknown) => void },
  redisUrl?: string,
): ISponsorMutex {
  if (redisUrl) {
    logger.info('Using distributed (Redis/Redlock) mutex', { redisUrl });
    return new DistributedSponsorMutex(redisUrl, logger);
  }
  logger.info('Using local (in-memory) mutex');
  return new SponsorMutex(logger);
}
