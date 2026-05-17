import { Request, Response, NextFunction } from 'express';
import { RelayerError } from '../errors';
import { PoolExhaustedError } from '../wallet/utxo-pool';

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof PoolExhaustedError) {
    res.set('Retry-After', String(err.retryAfterSeconds));
    res.status(err.httpStatus).json({
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        retryAfterSeconds: err.retryAfterSeconds,
        queueDepth: err.queueDepth,
      },
    });
    return;
  }

  if (err instanceof RelayerError) {
    res.status(err.httpStatus).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Unknown errors get generic 500
  res.status(500).json({
    ok: false,
    error: { code: 'BalanceError', message: 'internal error' },
  });
}
