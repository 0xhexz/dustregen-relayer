import { createLogger } from '../config/logger';

const logger = createLogger('transaction-builder');

export interface TransactionOptions {
  user?: string;
  amount?: bigint;
  signature?: string;
  fee?: number;
}

export async function buildTransaction(
  type: string,
  options: TransactionOptions
): Promise<any> {
  switch (type.toLowerCase()) {
    case 'sponsor':
      return buildSponsorshipTransaction(options);
    case 'deposit':
      return buildDepositTransaction(options);
    case 'update':
      return buildUpdateFeeTransaction(options);
    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }
}

function buildSponsorshipTransaction(options: TransactionOptions): any {
  if (!options.user || !options.amount || !options.signature) {
    throw new Error('Missing required options for sponsorship transaction');
  }
  
  return {
    type: 'contract_call',
    contract: 'DustRegenRelayer',
    function: 'sponsorTransaction',
    arguments: [
      options.user,
      options.amount.toString(),
      options.signature
    ],
    gasLimit: 1000000,
    metadata: {
      purpose: 'gas_sponsorship',
      timestamp: new Date().toISOString()
    }
  };
}

function buildDepositTransaction(options: TransactionOptions): any {
  if (!options.amount) {
    throw new Error('Missing amount for deposit transaction');
  }
  
  return {
    type: 'contract_call',
    contract: 'DustRegenRelayer',
    function: 'deposit',
    arguments: [options.amount.toString()],
    gasLimit: 500000,
    metadata: {
      purpose: 'relayer_deposit',
      timestamp: new Date().toISOString()
    }
  };
}

function buildUpdateFeeTransaction(options: TransactionOptions): any {
  if (options.fee === undefined) {
    throw new Error('Missing fee percentage for update transaction');
  }
  
  if (options.fee < 0 || options.fee > 100) {
    throw new Error('Fee percentage must be between 0 and 100');
  }
  
  return {
    type: 'contract_call',
    contract: 'DustRegenRelayer',
    function: 'updateFee',
    arguments: [options.fee.toString()],
    gasLimit: 300000,
    metadata: {
      purpose: 'fee_update',
      timestamp: new Date().toISOString()
    }
  };
}

export function validateTransactionStructure(transaction: any): boolean {
  const requiredFields = ['type', 'contract', 'function', 'arguments', 'gasLimit'];
  
  for (const field of requiredFields) {
    if (!transaction[field]) {
      logger.error(`Missing required field: ${field}`);
      return false;
    }
  }
  
  // Validate gas limit
  if (transaction.gasLimit <= 0) {
    logger.error('Invalid gas limit');
    return false;
  }
  
  // Validate arguments is an array
  if (!Array.isArray(transaction.arguments)) {
    logger.error('Arguments must be an array');
    return false;
  }
  
  return true;
}