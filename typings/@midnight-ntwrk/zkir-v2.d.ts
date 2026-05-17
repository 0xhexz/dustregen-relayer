declare module '@midnight-ntwrk/zkir-v2' {
  export interface KeyMaterialProvider {
    resolveKey(keyId: string): Promise<Uint8Array>;
  }

  export interface ProvingProvider {
    prove(circuit: string, inputs: unknown): Promise<Uint8Array>;
  }

  export class FetchZkConfigProvider {
    constructor(cdnBaseUrl: string);
    getProvingProvider(keyMaterialProvider: KeyMaterialProvider): ProvingProvider;
  }

  export class WasmProver implements ProvingProvider {
    constructor(configProvider: FetchZkConfigProvider);
    prove(circuit: string, inputs: unknown): Promise<Uint8Array>;
  }
}
