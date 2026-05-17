declare module '@midnight-ntwrk/indexer-api' {
  export interface DustNullifierTransaction {
    txHash: string;
    nullifiers: string[];
    blockHeight: bigint;
  }

  export interface DustGenerationEvent {
    address: string;
    amount: bigint;
    blockHeight: bigint;
    commitment: string;
  }

  export interface DustCommitmentMerkleTreeUpdate {
    rootHash: string;
    leaves: string[];
    blockHeight: bigint;
  }

  export function queryDustNullifierTransactions(
    indexerUrl: string,
    address: string,
  ): Promise<DustNullifierTransaction[]>;

  export function queryDustGenerationEvents(
    indexerUrl: string,
    address: string,
  ): Promise<DustGenerationEvent[]>;

  export function queryDustCommitmentMerkleTreeUpdate(
    indexerUrl: string,
    address: string,
  ): Promise<DustCommitmentMerkleTreeUpdate[]>;
}
