import { TransactionParseError } from '../errors.js';

export interface UnbalancedTransaction {
  type: 'unbalanced';
  inputs: Array<{ tokenKind: string; amount: string }>;
  outputs: Array<{ destination: string; tokenKind: string; amount: string }>;
  contractCall?: { address: string; circuit: string; args: unknown[] };
  [key: string]: unknown;
}

export interface BalancedTransaction {
  type: 'balanced';
  inputs: Array<{ tokenKind: string; amount: string; source?: string }>;
  outputs: Array<{ destination: string; tokenKind: string; amount: string }>;
  contractCall?: { address: string; circuit: string; args: unknown[] };
  estimatedFee?: bigint;
  [key: string]: unknown;
}

const HEX_REGEX = /^[0-9a-f]+$/;

export function serializeUnbalanced(tx: UnbalancedTransaction): string {
  const json = JSON.stringify({ ...tx, type: 'unbalanced' });
  return Buffer.from(json, 'utf8').toString('hex').toLowerCase();
}

export function deserializeUnbalanced(hex: string): UnbalancedTransaction {
  if (!hex || !HEX_REGEX.test(hex.toLowerCase())) {
    throw new TransactionParseError('Input is not valid hex', { input: hex?.substring(0, 50) });
  }
  try {
    const json = Buffer.from(hex, 'hex').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed.type !== 'unbalanced') {
      throw new TransactionParseError('Transaction is not an unbalanced transaction', { type: parsed.type });
    }
    if (!Array.isArray(parsed.inputs) || !Array.isArray(parsed.outputs)) {
      throw new TransactionParseError('Transaction missing required fields (inputs, outputs)');
    }
    return parsed as UnbalancedTransaction;
  } catch (e) {
    if (e instanceof TransactionParseError) throw e;
    throw new TransactionParseError('Failed to deserialize transaction', { cause: (e as Error).message });
  }
}

export function serializeBalanced(tx: BalancedTransaction): string {
  const serializable = { ...tx, type: 'balanced', estimatedFee: tx.estimatedFee?.toString() };
  const json = JSON.stringify(serializable);
  return Buffer.from(json, 'utf8').toString('hex').toLowerCase();
}

export function deserializeBalanced(hex: string): BalancedTransaction {
  if (!hex || !HEX_REGEX.test(hex.toLowerCase())) {
    throw new TransactionParseError('Input is not valid hex', { input: hex?.substring(0, 50) });
  }
  try {
    const json = Buffer.from(hex, 'hex').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed.type !== 'balanced') {
      throw new TransactionParseError('Transaction is not a balanced transaction', { type: parsed.type });
    }
    if (!Array.isArray(parsed.inputs) || !Array.isArray(parsed.outputs)) {
      throw new TransactionParseError('Transaction missing required fields (inputs, outputs)');
    }
    if (parsed.estimatedFee) {
      parsed.estimatedFee = BigInt(parsed.estimatedFee);
    }
    return parsed as BalancedTransaction;
  } catch (e) {
    if (e instanceof TransactionParseError) throw e;
    throw new TransactionParseError('Failed to deserialize balanced transaction', { cause: (e as Error).message });
  }
}
