export type ErrorCode =
  | 'WalletSyncTimeoutError'
  | 'InsufficientDUSTBalanceError'
  | 'InsufficientFeeError'
  | 'TransactionParseError'
  | 'BalanceError'
  | 'NetworkSubmissionError'
  | 'ConfigurationError'
  | 'InvalidContractError';

export abstract class RelayerError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;

  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class WalletSyncTimeoutError extends RelayerError {
  readonly code = 'WalletSyncTimeoutError' as const;
  readonly httpStatus = 503;
}

export class InsufficientDUSTBalanceError extends RelayerError {
  readonly code = 'InsufficientDUSTBalanceError' as const;
  readonly httpStatus = 402;
}

export class InsufficientFeeError extends RelayerError {
  readonly code = 'InsufficientFeeError' as const;
  readonly httpStatus = 402;
}

export class TransactionParseError extends RelayerError {
  readonly code = 'TransactionParseError' as const;
  readonly httpStatus = 400;
}

export class BalanceError extends RelayerError {
  readonly code = 'BalanceError' as const;
  readonly httpStatus = 502;
}

export class NetworkSubmissionError extends RelayerError {
  readonly code = 'NetworkSubmissionError' as const;
  readonly httpStatus = 502;
}

export class ConfigurationError extends RelayerError {
  readonly code = 'ConfigurationError' as const;
  readonly httpStatus = 500;
}

export class InvalidContractError extends RelayerError {
  readonly code = 'InvalidContractError' as const;
  readonly httpStatus = 403;
}
