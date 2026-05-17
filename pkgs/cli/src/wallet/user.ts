import { NetworkConfig } from '../config/network.js';
import { waitForWalletSync, Wallet, WalletState } from './sponsor.js';

export interface EphemeralUserWallet {
  readonly wallet: Wallet;
  readonly secretKey: Uint8Array;
  readonly publicKey: string;
  readonly nativeAddress: string;
  close(): Promise<void>;
}

/**
 * Build an ephemeral user wallet with zero balances.
 * Uses in-memory private-state provider (no LevelDB).
 */
export async function buildEphemeralUserWallet(
  cfg: NetworkConfig,
  deps?: {
    wallet: Wallet;
    secretKey: Uint8Array;
    publicKey: string;
    nativeAddress: string;
  }
): Promise<EphemeralUserWallet> {
  if (deps) {
    // Testing/injection path
    await waitForWalletSync(deps.wallet, cfg.walletSyncTimeoutMs);
    return {
      wallet: deps.wallet,
      secretKey: deps.secretKey,
      publicKey: deps.publicKey,
      nativeAddress: deps.nativeAddress,
      close: async () => { await deps.wallet.close?.(); },
    };
  }

  // Production path
  throw new Error('Production user wallet initialization requires @midnight-ntwrk/wallet');
}
