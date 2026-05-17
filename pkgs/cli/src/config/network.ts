import { ConfigurationError } from '../errors.js';

export type SeedEncryptionMode = 'plaintext' | 'kms' | 'passphrase';

export interface NetworkConfig {
  readonly networkId: 'PreProd';
  readonly nodeRpcUrl: string;
  readonly indexerUrl: string;
  readonly indexerWsUrl: string;
  /** @deprecated Use WASM-based ProvingProvider from @midnight-ntwrk/zkir-v2 instead */
  readonly proofServerUrl: string;
  readonly contractAddress: string;
  readonly sponsorSeed: string;
  readonly privateStateDir: string;
  readonly walletSyncTimeoutMs: number;
  readonly relayerPort: number;
  readonly additionalFeeOverhead: bigint;
  readonly seedEncryptionMode: SeedEncryptionMode;
  readonly kmsKeyId?: string;
  readonly kmsRegion?: string;
  readonly encryptedSeedPath?: string;
}

const CONTRACT_ADDRESS_REGEX = /^(0x)?[0-9a-fA-F]{64}$/;

function requireEnv(env: Record<string, string | undefined>, key: string, label: string): string {
  const value = env[key];
  if (!value || value.trim() === '') {
    throw new ConfigurationError(`Missing required environment variable: ${key} (${label})`);
  }
  return value.trim();
}

function validateUrl(value: string, key: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new ConfigurationError(`Invalid URL for ${key}: ${value}`);
  }
}

export function loadNetworkConfig(env: Record<string, string | undefined> = process.env): NetworkConfig {
  const networkId = env['NETWORK_ID'] || 'PreProd';
  if (networkId !== 'PreProd') {
    throw new ConfigurationError(`Unsupported NETWORK_ID: ${networkId}. Only 'PreProd' is supported.`);
  }

  const nodeRpcUrl = validateUrl(requireEnv(env, 'NODE_RPC_URL', 'Node RPC endpoint'), 'NODE_RPC_URL');
  const indexerUrl = validateUrl(requireEnv(env, 'INDEXER_URL', 'Indexer GraphQL endpoint'), 'INDEXER_URL');
  const indexerWsUrl = validateUrl(requireEnv(env, 'INDEXER_WS_URL', 'Indexer WebSocket endpoint'), 'INDEXER_WS_URL');
  const proofServerUrl = validateUrl(requireEnv(env, 'PROOF_SERVER_URL', 'Proof server endpoint'), 'PROOF_SERVER_URL');

  const contractAddress = requireEnv(env, 'CONTRACT_ADDRESS', 'Contract address');
  if (!CONTRACT_ADDRESS_REGEX.test(contractAddress)) {
    throw new ConfigurationError(
      `Invalid CONTRACT_ADDRESS: must be 64 hex characters (with optional 0x prefix), got: ${contractAddress}`
    );
  }

  // Seed encryption mode
  const seedEncryptionModeRaw = (env['SEED_ENCRYPTION_MODE']?.trim() || 'plaintext') as string;
  if (!['plaintext', 'kms', 'passphrase'].includes(seedEncryptionModeRaw)) {
    throw new ConfigurationError(
      `Invalid SEED_ENCRYPTION_MODE: must be 'plaintext', 'kms', or 'passphrase', got: ${seedEncryptionModeRaw}`
    );
  }
  const seedEncryptionMode = seedEncryptionModeRaw as SeedEncryptionMode;

  let sponsorSeed = '';
  let kmsKeyId: string | undefined;
  let kmsRegion: string | undefined;
  let encryptedSeedPath: string | undefined;

  if (seedEncryptionMode === 'plaintext') {
    sponsorSeed = requireEnv(env, 'SPONSOR_SEED', 'Sponsor wallet seed phrase');
    // eslint-disable-next-line no-console
    console.warn('[DEPRECATION] SEED_ENCRYPTION_MODE=plaintext is deprecated. Use kms or passphrase mode for production.');
  } else if (seedEncryptionMode === 'kms') {
    kmsKeyId = requireEnv(env, 'KMS_KEY_ID', 'AWS KMS Key ID');
    kmsRegion = requireEnv(env, 'KMS_REGION', 'AWS KMS Region');
    encryptedSeedPath = requireEnv(env, 'ENCRYPTED_SEED_PATH', 'Path to encrypted seed file');
  } else if (seedEncryptionMode === 'passphrase') {
    encryptedSeedPath = requireEnv(env, 'ENCRYPTED_SEED_PATH', 'Path to encrypted seed file');
  }

  const privateStateDir = env['PRIVATE_STATE_DIR']?.trim() || './.sponsor-state';

  const walletSyncTimeoutRaw = env['WALLET_SYNC_TIMEOUT_MS']?.trim();
  let walletSyncTimeoutMs = 120000;
  if (walletSyncTimeoutRaw) {
    const parsed = parseInt(walletSyncTimeoutRaw, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new ConfigurationError(`Invalid WALLET_SYNC_TIMEOUT_MS: must be a positive integer, got: ${walletSyncTimeoutRaw}`);
    }
    walletSyncTimeoutMs = parsed;
  }

  const relayerPortRaw = env['RELAYER_PORT']?.trim();
  let relayerPort = 3000;
  if (relayerPortRaw) {
    const parsed = parseInt(relayerPortRaw, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      throw new ConfigurationError(`Invalid RELAYER_PORT: must be 1-65535, got: ${relayerPortRaw}`);
    }
    relayerPort = parsed;
  }

  const feeOverheadRaw = env['ADDITIONAL_FEE_OVERHEAD']?.trim();
  let additionalFeeOverhead = 1000n;
  if (feeOverheadRaw) {
    try {
      additionalFeeOverhead = BigInt(feeOverheadRaw);
    } catch {
      throw new ConfigurationError(`Invalid ADDITIONAL_FEE_OVERHEAD: must be a valid integer, got: ${feeOverheadRaw}`);
    }
  }

  return {
    networkId: 'PreProd',
    nodeRpcUrl,
    indexerUrl,
    indexerWsUrl,
    proofServerUrl,
    contractAddress,
    sponsorSeed,
    privateStateDir,
    walletSyncTimeoutMs,
    relayerPort,
    additionalFeeOverhead,
    seedEncryptionMode,
    kmsKeyId,
    kmsRegion,
    encryptedSeedPath,
  };
}
