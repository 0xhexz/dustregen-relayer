import { Request, Response, NextFunction } from 'express';
import { RelayerError } from '../errors';

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
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
