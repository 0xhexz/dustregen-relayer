import winston from 'winston';
import path from 'path';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

export function createLogger(service: string) {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service },
    transports: [
      // Console transport
      new winston.transports.Console({
        format: consoleFormat
      }),
      // File transport
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'dustregen-error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'dustregen-combined.log'),
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ]
  });

  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  try {
    require('fs').mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    // Directory already exists or permission error
  }

  return logger;
}

// Export common log levels
export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
} as const;