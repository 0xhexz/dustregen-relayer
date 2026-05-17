import {
  queryDustNullifierTransactions,
  queryDustGenerationEvents,
  queryDustCommitmentMerkleTreeUpdate,
} from '@midnight-ntwrk/indexer-api';

export interface FastSyncResult {
  nullifiers: string[];
  generatedAllocations: Array<{ amount: bigint; commitment: string }>;
  merkleRoot: string;
  merkleLeaves: string[];
  syncedToBlock: bigint;
}

/**
 * Perform a fast-sync of the sponsor wallet by querying indexer endpoints
 * in parallel, avoiding block-by-block scanning.
 */
export async function fastSyncSponsorWallet(
  indexerUrl: string,
  address: string,
): Promise<FastSyncResult> {
  const startTime = Date.now();

  const [nullifierTxs, generationEvents, merkleUpdates] = await Promise.all([
    queryDustNullifierTransactions(indexerUrl, address),
    queryDustGenerationEvents(indexerUrl, address),
    queryDustCommitmentMerkleTreeUpdate(indexerUrl, address),
  ]);

  // Collect all nullifiers from transactions
  const nullifiers = nullifierTxs.flatMap((tx) => tx.nullifiers);

  // Map generation events to allocations
  const generatedAllocations = generationEvents.map((evt) => ({
    amount: evt.amount,
    commitment: evt.commitment,
  }));

  // Find the latest merkle update for root hash and leaves
  const latestMerkle = merkleUpdates.length > 0
    ? merkleUpdates.reduce((latest, update) =>
        update.blockHeight > latest.blockHeight ? update : latest
      )
    : { rootHash: '', leaves: [], blockHeight: 0n };

  // Determine the highest block we synced to
  const allBlockHeights = [
    ...nullifierTxs.map((tx) => tx.blockHeight),
    ...generationEvents.map((evt) => evt.blockHeight),
    ...merkleUpdates.map((u) => u.blockHeight),
  ];
  const syncedToBlock = allBlockHeights.length > 0
    ? allBlockHeights.reduce((max, h) => (h > max ? h : max))
    : 0n;

  const elapsed = Date.now() - startTime;
  // Log timing info (using console for now; callers can integrate with logger)
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[fast-sync] Completed in ${elapsed}ms, synced to block ${syncedToBlock}`);
  }

  return {
    nullifiers,
    generatedAllocations,
    merkleRoot: latestMerkle.rootHash,
    merkleLeaves: latestMerkle.leaves,
    syncedToBlock,
  };
}
