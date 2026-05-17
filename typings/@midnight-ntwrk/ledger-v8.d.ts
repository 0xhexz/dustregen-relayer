declare module '@midnight-ntwrk/ledger-v8' {
  export interface LedgerState {
    [key: string]: any;
  }

  export function queryLedger(contractAddress: string): Promise<LedgerState>;
}
