declare module '@aws-sdk/client-kms' {
  export interface KMSClientConfig {
    region: string;
  }

  export class KMSClient {
    constructor(config: KMSClientConfig);
    send(command: any): Promise<any>;
  }

  export interface DecryptCommandInput {
    CiphertextBlob: Uint8Array;
    KeyId?: string;
  }

  export interface DecryptCommandOutput {
    Plaintext?: Uint8Array;
  }

  export class DecryptCommand {
    constructor(input: DecryptCommandInput);
  }
}
