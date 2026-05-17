// Mock for @midnight-ntwrk/indexer-api
export const queryDustNullifierTransactions = jest.fn().mockResolvedValue([
  { txHash: 'tx-001', nullifiers: ['nf-1', 'nf-2'], blockHeight: 50n },
]);

export const queryDustGenerationEvents = jest.fn().mockResolvedValue([
  { address: 'addr-1', amount: 1000n, blockHeight: 55n, commitment: 'commit-1' },
]);

export const queryDustCommitmentMerkleTreeUpdate = jest.fn().mockResolvedValue([
  { rootHash: 'root-abc', leaves: ['leaf-1', 'leaf-2'], blockHeight: 60n },
]);
