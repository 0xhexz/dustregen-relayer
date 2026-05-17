// Mock for @midnight-ntwrk/zkir-v2
export class FetchZkConfigProvider {
  constructor(public cdnBaseUrl: string) {}
  getProvingProvider(keyMaterialProvider: any) {
    return new WasmProver(this);
  }
}

export class WasmProver {
  constructor(public configProvider: FetchZkConfigProvider) {}
  async prove(circuit: string, inputs: unknown): Promise<Uint8Array> {
    return new Uint8Array(64);
  }
}
