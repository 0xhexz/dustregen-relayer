import winston from 'winston';

const SENSITIVE_PATTERN = /seed|mnemonic|private|authorization/i;

function createRedactingFormat(sensitiveValues: string[] = []) {
  return winston.format((info) => {
    const redact = (obj: unknown): unknown => {
      if (typeof obj === 'string') {
        let result = obj;
        for (const val of sensitiveValues) {
          if (val && result.includes(val)) {
            result = result.replace(new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]');
          }
        }
        return result;
      }
      if (Array.isArray(obj)) return obj.map(redact);
      if (obj && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          if (SENSITIVE_PATTERN.test(key)) {
            result[key] = '[REDACTED]';
          } else {
            result[key] = redact(value);
          }
        }
        return result;
      }
      return obj;
    };

    const redacted = redact(info) as Record<string, unknown>;
    return { ...info, ...redacted } as winston.Logform.TransformableInfo;
  })();
}

export function createLogger(service: string, sensitiveValues: string[] = []) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service },
    format: winston.format.combine(
      createRedactingFormat(sensitiveValues),
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
        silent: process.env.NODE_ENV === 'test',
      }),
    ],
  });
}

export type Logger = ReturnType<typeof createLogger>;
