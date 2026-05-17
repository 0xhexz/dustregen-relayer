declare module '@midnight-ntwrk/wallet-api' {
  export interface WalletAPI {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
  }
}
