declare module '@midnight-ntwrk/wallet' {
  export interface WalletConfig {
    mnemonic?: string;
    network?: string;
  }

  export class Wallet {
    static create(config: WalletConfig): Promise<Wallet>;
    getAddress(): Promise<string>;
    getBalance(): Promise<bigint>;
    waitForSync(): Promise<void>;
    signTransaction(transaction: any): Promise<string>;
    submitTransaction(signedTransaction: string): Promise<string>;
  }
}
