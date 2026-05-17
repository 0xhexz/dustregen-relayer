import {
  FetchZkConfigProvider,
  WasmProver,
  KeyMaterialProvider,
  ProvingProvider,
} from '@midnight-ntwrk/zkir-v2';

export type { ProvingProvider } from '@midnight-ntwrk/zkir-v2';

export interface ProvingConfig {
  zkConfigCdnUrl: string;
  /**
   * Optional system key material for zswap circuits. If not provided,
   * the provider is created in scaffold mode and will throw a descriptive
   * error if prove() is actually invoked without real keys configured.
   */
  systemKeys?: Record<string, Uint8Array>;
}

/**
 * SCAFFOLD / PLACEHOLDER:
 * These are zeroed-out 32-byte arrays serving as placeholders during the
 * transition from the deprecated proverServerUri HTTP-based proving to
 * local WASM-based proving. Real system keys must be loaded from a trusted
 * source (e.g., the ZK ceremony output or a CDN) before any actual proving
 * circuit can execute. If prove() is called with these placeholder keys,
 * the resulting proofs will be invalid.
 */
const PLACEHOLDER_SYSTEM_KEYS: Record<string, Uint8Array> = {
  'zswap/spend': new Uint8Array(32),
  'zswap/output': new Uint8Array(32),
};

/**
 * Creates a WASM-based proving provider using FetchZkConfigProvider.
 *
 * If config.systemKeys is provided, those keys are used for circuit proving.
 * Otherwise, placeholder (all-zero) keys are used and the key resolver will
 * throw a descriptive error if invoked in a context where real proving is
 * expected (i.e., when PROVING_ENABLED=true environment variable is set).
 */
export function createProvingProvider(config: ProvingConfig): ProvingProvider {
  const configProvider = new FetchZkConfigProvider(config.zkConfigCdnUrl);
  const keys = config.systemKeys ?? PLACEHOLDER_SYSTEM_KEYS;
  const isPlaceholder = !config.systemKeys;

  const keyMaterialProvider: KeyMaterialProvider = {
    async resolveKey(keyId: string): Promise<Uint8Array> {
      const key = keys[keyId];
      if (!key) {
        throw new Error(`Unknown key ID: ${keyId}`);
      }
      // If using placeholder keys in a production context, throw a descriptive error
      if (isPlaceholder && process.env.PROVING_ENABLED === 'true') {
        throw new Error(
          `Proving provider is using placeholder (all-zero) system keys for "${keyId}". ` +
          `Real key material must be configured via ProvingConfig.systemKeys before ` +
          `local WASM proving can produce valid proofs. Set PROVING_ENABLED=false or ` +
          `provide real keys from the ZK ceremony output.`
        );
      }
      return key;
    },
  };

  return configProvider.getProvingProvider(keyMaterialProvider);
}
