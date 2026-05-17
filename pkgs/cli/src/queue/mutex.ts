import { Mutex } from 'async-mutex';

export class SponsorMutex {
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
