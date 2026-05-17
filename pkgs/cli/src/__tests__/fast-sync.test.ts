import { fastSyncSponsorWallet } from '../wallet/fast-sync';
import {
  queryDustNullifierTransactions,
  queryDustGenerationEvents,
  queryDustCommitmentMerkleTreeUpdate,
} from '@midnight-ntwrk/indexer-api';

const mockQueryNullifiers = queryDustNullifierTransactions as jest.MockedFunction<typeof queryDustNullifierTransactions>;
const mockQueryGeneration = queryDustGenerationEvents as jest.MockedFunction<typeof queryDustGenerationEvents>;
const mockQueryMerkle = queryDustCommitmentMerkleTreeUpdate as jest.MockedFunction<typeof queryDustCommitmentMerkleTreeUpdate>;

describe('fastSyncSponsorWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should query all three endpoints in parallel and combine results', async () => {
    mockQueryNullifiers.mockResolvedValue([
      { txHash: 'tx-1', nullifiers: ['nf-a', 'nf-b'], blockHeight: 10n },
      { txHash: 'tx-2', nullifiers: ['nf-c'], blockHeight: 20n },
    ]);
    mockQueryGeneration.mockResolvedValue([
      { address: 'addr-1', amount: 500n, blockHeight: 15n, commitment: 'c1' },
      { address: 'addr-1', amount: 300n, blockHeight: 25n, commitment: 'c2' },
    ]);
    mockQueryMerkle.mockResolvedValue([
      { rootHash: 'root-1', leaves: ['l1'], blockHeight: 12n },
      { rootHash: 'root-2', leaves: ['l2', 'l3'], blockHeight: 30n },
    ]);

    const result = await fastSyncSponsorWallet('http://indexer.test', 'addr-1');

    expect(mockQueryNullifiers).toHaveBeenCalledWith('http://indexer.test', 'addr-1');
    expect(mockQueryGeneration).toHaveBeenCalledWith('http://indexer.test', 'addr-1');
    expect(mockQueryMerkle).toHaveBeenCalledWith('http://indexer.test', 'addr-1');

    expect(result.nullifiers).toEqual(['nf-a', 'nf-b', 'nf-c']);
    expect(result.generatedAllocations).toEqual([
      { amount: 500n, commitment: 'c1' },
      { amount: 300n, commitment: 'c2' },
    ]);
    expect(result.merkleRoot).toBe('root-2');
    expect(result.merkleLeaves).toEqual(['l2', 'l3']);
    expect(result.syncedToBlock).toBe(30n);
  });

  it('should handle empty responses', async () => {
    mockQueryNullifiers.mockResolvedValue([]);
    mockQueryGeneration.mockResolvedValue([]);
    mockQueryMerkle.mockResolvedValue([]);

    const result = await fastSyncSponsorWallet('http://indexer.test', 'addr-1');

    expect(result.nullifiers).toEqual([]);
    expect(result.generatedAllocations).toEqual([]);
    expect(result.merkleRoot).toBe('');
    expect(result.merkleLeaves).toEqual([]);
    expect(result.syncedToBlock).toBe(0n);
  });

  it('should propagate errors from indexer queries', async () => {
    mockQueryNullifiers.mockRejectedValue(new Error('indexer unavailable'));
    mockQueryGeneration.mockResolvedValue([]);
    mockQueryMerkle.mockResolvedValue([]);

    await expect(
      fastSyncSponsorWallet('http://indexer.test', 'addr-1'),
    ).rejects.toThrow('indexer unavailable');
  });

  it('should select the latest merkle update by block height', async () => {
    mockQueryNullifiers.mockResolvedValue([]);
    mockQueryGeneration.mockResolvedValue([]);
    mockQueryMerkle.mockResolvedValue([
      { rootHash: 'old-root', leaves: ['old-l1'], blockHeight: 5n },
      { rootHash: 'new-root', leaves: ['new-l1', 'new-l2'], blockHeight: 100n },
      { rootHash: 'mid-root', leaves: ['mid-l1'], blockHeight: 50n },
    ]);

    const result = await fastSyncSponsorWallet('http://indexer.test', 'addr-1');

    expect(result.merkleRoot).toBe('new-root');
    expect(result.merkleLeaves).toEqual(['new-l1', 'new-l2']);
    expect(result.syncedToBlock).toBe(100n);
  });
});
