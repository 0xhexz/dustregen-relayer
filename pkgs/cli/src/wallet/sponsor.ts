import { firstValueFrom, filter, timeout, throwError, Observable } from 'rxjs';
import { WalletSyncTimeoutError, InsufficientDUSTBalanceError } from '../errors.js';
import { NetworkConfig } from '../config/network.js';
import { ProvingProvider } from './proving-provider.js';
import { fastSyncSponsorWallet } from './fast-sync.js';

// Types representing Midnight wallet interfaces (mocked in tests)
export interface WalletState {
  syncProgress?: { synced: boolean };
  balances?: {
    dust?: bigint;
    night?: bigint;
  };
  registrations?: Array<{
    type: string;
    active: boolean;
    cNightInput?: boolean;
  }>;
}

export interface Wallet {
  state(): Observable<WalletState>;
  balanceUnsealedTransaction(tx: unknown, options: {
    tokenKindsToBalance: string[];
    changeOutputDestination: string;
    additionalFeeOverhead: bigint;
  }): Promise<unknown>;
  close?(): Promise<void>;
}

export interface SponsorWallet {
  readonly wallet: Wallet;
  readonly publicKey: string;
  readonly nativeAddress: string;
  close(): Promise<void>;
}

/**
 * Wait for wallet to emit synced state, or throw WalletSyncTimeoutError.
 * Uses RxJS firstValueFrom with filter + timeout.
 */
export async function waitForWalletSync(
  wallet: Wallet,
  timeoutMs: number,
): Promise<WalletState> {
  return firstValueFrom(
    wallet.state().pipe(
      filter((s: WalletState) => s.syncProgress?.synced === true),
      timeout({
        each: timeoutMs,
        with: () => throwError(() => new WalletSyncTimeoutError(
          `Wallet sync timed out after ${timeoutMs}ms`,
          { timeoutMs }
        )),
      }),
    ),
  );
}

/**
 * Verify that the synced wallet state has a live DustRegistration
 * referencing a cNIGHT input and positive DUST balance.
 */
export function verifyDustRegistration(state: WalletState): void {
  const dustBalance = state.balances?.dust ?? 0n;
  const nightBalance = state.balances?.night ?? 0n;

  const hasLiveRegistration = state.registrations?.some(
    (r) => r.type === 'DustRegistration' && r.active && r.cNightInput
  ) ?? false;

  if (!hasLiveRegistration || dustBalance <= 0n) {
    throw new InsufficientDUSTBalanceError(
      'No active DUST registration with cNIGHT input found, or DUST balance is zero',
      { dustBalance: dustBalance.toString(), nightBalance: nightBalance.toString(), hasLiveRegistration }
    );
  }
}

/**
 * Build the persistent sponsor wallet. In a real implementation this would
 * wire LevelDB and restore from seed. For testing, it accepts injected deps.
 */
export async function buildSponsorWallet(cfg: NetworkConfig, deps?: {
  wallet: Wallet;
  publicKey: string;
  nativeAddress: string;
  provingProvider?: ProvingProvider;
  fastSync?: boolean;
}): Promise<SponsorWallet> {
  if (deps) {
    // Testing/injection path
    return {
      wallet: deps.wallet,
      publicKey: deps.publicKey,
      nativeAddress: deps.nativeAddress,
      close: async () => { await deps.wallet.close?.(); },
    };
  }

  // Production path - would use @midnight-ntwrk/wallet + @midnight-ntwrk/level-private-state-provider
  // If fast-sync is enabled via env, sync wallet state from indexer before full initialization
  const fastSyncEnabled = process.env.FAST_SYNC_ENABLED === 'true';
  if (fastSyncEnabled) {
    await fastSyncSponsorWallet(cfg.indexerUrl, cfg.contractAddress);
  }

  throw new Error('Production wallet initialization requires @midnight-ntwrk/wallet and @midnight-ntwrk/level-private-state-provider');
}
