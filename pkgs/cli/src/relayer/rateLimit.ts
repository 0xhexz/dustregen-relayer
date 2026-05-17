import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { deserializeUnbalanced } from '../transaction/codec';

export function createIpRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        ok: false,
        error: {
          code: 'RateLimitExceeded',
          message: 'Too many requests from this IP, please try again later',
        },
      });
    },
  });
}

export function createAddressRateLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request): string => {
      try {
        const hex = req.body?.unbalancedTx;
        if (typeof hex === 'string' && hex.length > 0) {
          const tx = deserializeUnbalanced(hex);
          const address =
            tx.contractCall?.address ||
            (tx.outputs.length > 0 ? tx.outputs[0].destination : undefined);
          if (address) {
            return address.toLowerCase();
          }
        }
      } catch {
        // Fall back to IP-based key on parse failure
      }
      return req.ip || 'unknown';
    },
    handler: (_req, res) => {
      res.status(429).json({
        ok: false,
        error: {
          code: 'AddressRateLimitExceeded',
          message: 'Too many requests for this address',
        },
      });
    },
  });
}
