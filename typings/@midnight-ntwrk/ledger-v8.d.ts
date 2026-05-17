declare module '@midnight-ntwrk/ledger-v8' {
  export interface LedgerState {
    [key: string]: any;
  }

  export function queryLedger(contractAddress: string): Promise<LedgerState>;

  export interface LedgerBudget {
    verificationBudget: bigint;
  }

  export interface DimensionWeights {
    verification: bigint;
    storage: bigint;
  }

  export function compute_maximum_price_adjustment(
    blockHeight: bigint,
    opts: { baseVerificationBudget: bigint; targetDimensionWeight: bigint },
  ): bigint;

  export function getCurrentBlockHeight(indexerUrl: string): Promise<bigint>;
}
