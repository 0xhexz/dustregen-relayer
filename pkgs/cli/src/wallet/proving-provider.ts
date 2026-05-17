import {
  FetchZkConfigProvider,
  WasmProver,
  KeyMaterialProvider,
  ProvingProvider,
} from '@midnight-ntwrk/zkir-v2';

export type { ProvingProvider } from '@midnight-ntwrk/zkir-v2';

export interface ProvingConfig {
  zkConfigCdnUrl: string;
}

/** Default system key IDs used for key resolution */
const SYSTEM_KEYS: Record<string, Uint8Array> = {
  'zswap/spend': new Uint8Array(32),
  'zswap/output': new Uint8Array(32),
};

/**
 * Creates a WASM-based proving provider using FetchZkConfigProvider.
 * Provides default key resolution for zswap/spend and zswap/output system keys.
 */
export function createProvingProvider(config: ProvingConfig): ProvingProvider {
  const configProvider = new FetchZkConfigProvider(config.zkConfigCdnUrl);

  const keyMaterialProvider: KeyMaterialProvider = {
    async resolveKey(keyId: string): Promise<Uint8Array> {
      const systemKey = SYSTEM_KEYS[keyId];
      if (systemKey) {
        return systemKey;
      }
      throw new Error(`Unknown key ID: ${keyId}`);
    },
  };

  return configProvider.getProvingProvider(keyMaterialProvider);
}
