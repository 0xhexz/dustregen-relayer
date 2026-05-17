import {
  getCurrentBlockHeight,
  compute_maximum_price_adjustment,
} from '@midnight-ntwrk/ledger-v8';

/**
 * Compute a dynamic fee safety margin based on the current block height
 * and ledger price adjustment parameters.
 *
 * On failure, throws a descriptive error; the caller handles fallback.
 */
export async function computeDynamicFeeSafetyMargin(indexerUrl: string): Promise<bigint> {
  const blockHeight = await getCurrentBlockHeight(indexerUrl);

  const safetyMargin = compute_maximum_price_adjustment(blockHeight, {
    baseVerificationBudget: 1000n,
    targetDimensionWeight: 1000n,
  });

  return safetyMargin;
}
