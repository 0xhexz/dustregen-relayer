import { ConfigurationError } from '../errors.js';

export interface NetworkConfig {
  readonly networkId: 'PreProd';
  readonly nodeRpcUrl: string;
  readonly indexerUrl: string;
  readonly indexerWsUrl: string;
  readonly proofServerUrl: string;
  readonly contractAddress: string;
  readonly sponsorSeed: string;
  readonly privateStateDir: string;
  readonly walletSyncTimeoutMs: number;
  readonly relayerPort: number;
  readonly additionalFeeOverhead: bigint;
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

  const sponsorSeed = requireEnv(env, 'SPONSOR_SEED', 'Sponsor wallet seed phrase');

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
  };
}
