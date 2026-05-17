import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { NetworkConfig } from '../config/network';
import { loadSponsorKeyMaterial, encryptSeedWithPassphrase, decryptWithPassphrase } from '../config/key-loader';

// Mock @clack/prompts
jest.mock('@clack/prompts', () => ({
  password: jest.fn(),
  isCancel: jest.fn().mockReturnValue(false),
}));

// Mock @aws-sdk/client-kms
jest.mock('@aws-sdk/client-kms', () => {
  const mockSend = jest.fn();
  return {
    KMSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    DecryptCommand: jest.fn(),
    __mockSend: mockSend,
  };
});

// Mock fs.readFileSync
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  readFileSync: jest.fn(),
}));

function createBaseConfig(overrides: Partial<NetworkConfig> = {}): NetworkConfig {
  return {
    networkId: 'PreProd',
    nodeRpcUrl: 'http://localhost:9944',
    indexerUrl: 'http://localhost:8080',
    indexerWsUrl: 'ws://localhost:8080',
    proofServerUrl: 'http://localhost:6300',
    contractAddress: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    sponsorSeed: 'test-seed-phrase-not-real',
    privateStateDir: './.test-state',
    walletSyncTimeoutMs: 5000,
    relayerPort: 3000,
    additionalFeeOverhead: 1000n,
    seedEncryptionMode: 'plaintext',
    ...overrides,
  };
}

describe('key-loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('plaintext mode', () => {
    test('returns seed directly in plaintext mode', async () => {
      const cfg = createBaseConfig({
        seedEncryptionMode: 'plaintext',
        sponsorSeed: 'my-secret-seed-phrase',
      });

      const result = await loadSponsorKeyMaterial(cfg);
      expect(result).toBe('my-secret-seed-phrase');
    });

    test('throws ConfigurationError when sponsorSeed is empty in plaintext mode', async () => {
      const cfg = createBaseConfig({
        seedEncryptionMode: 'plaintext',
        sponsorSeed: '',
      });

      await expect(loadSponsorKeyMaterial(cfg)).rejects.toThrow(
        'SPONSOR_SEED is required when seedEncryptionMode is plaintext'
      );
    });
  });

  describe('passphrase mode', () => {
    test('decrypts correctly with valid passphrase', async () => {
      const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const passphrase = 'my-strong-passphrase';
      const encrypted = encryptSeedWithPassphrase(seed, passphrase);

      const clack = require('@clack/prompts');
      clack.password.mockResolvedValue(passphrase);

      (fs.readFileSync as jest.Mock).mockReturnValue(encrypted);

      const cfg = createBaseConfig({
        seedEncryptionMode: 'passphrase',
        encryptedSeedPath: '/path/to/encrypted.bin',
      });

      const result = await loadSponsorKeyMaterial(cfg);
      expect(result).toBe(seed);
    });

    test('throws ConfigurationError when passphrase is cancelled', async () => {
      const clack = require('@clack/prompts');
      clack.password.mockResolvedValue(null);
      clack.isCancel.mockReturnValue(true);

      const cfg = createBaseConfig({
        seedEncryptionMode: 'passphrase',
        encryptedSeedPath: '/path/to/encrypted.bin',
      });

      await expect(loadSponsorKeyMaterial(cfg)).rejects.toThrow(
        'Passphrase input was cancelled'
      );
    });

    test('throws ConfigurationError when encryptedSeedPath is missing', async () => {
      const cfg = createBaseConfig({
        seedEncryptionMode: 'passphrase',
        encryptedSeedPath: undefined,
      });

      await expect(loadSponsorKeyMaterial(cfg)).rejects.toThrow(
        'ENCRYPTED_SEED_PATH is required when seedEncryptionMode is passphrase'
      );
    });
  });

  describe('kms mode', () => {
    test('calls KMS client to decrypt seed', async () => {
      const expectedSeed = 'kms-decrypted-seed-phrase';
      const kmsModule = require('@aws-sdk/client-kms');
      kmsModule.__mockSend.mockResolvedValue({
        Plaintext: new TextEncoder().encode(expectedSeed),
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('encrypted-data'));

      const cfg = createBaseConfig({
        seedEncryptionMode: 'kms',
        kmsKeyId: 'arn:aws:kms:us-east-1:123456789:key/test-key',
        kmsRegion: 'us-east-1',
        encryptedSeedPath: '/path/to/encrypted.bin',
      });

      const result = await loadSponsorKeyMaterial(cfg);
      expect(result).toBe(expectedSeed);
      expect(kmsModule.KMSClient).toHaveBeenCalledWith({ region: 'us-east-1' });
      expect(kmsModule.DecryptCommand).toHaveBeenCalled();
      expect(kmsModule.__mockSend).toHaveBeenCalled();
    });

    test('throws ConfigurationError when KMS returns empty plaintext', async () => {
      const kmsModule = require('@aws-sdk/client-kms');
      kmsModule.__mockSend.mockResolvedValue({ Plaintext: undefined });

      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('encrypted-data'));

      const cfg = createBaseConfig({
        seedEncryptionMode: 'kms',
        kmsKeyId: 'arn:aws:kms:us-east-1:123456789:key/test-key',
        kmsRegion: 'us-east-1',
        encryptedSeedPath: '/path/to/encrypted.bin',
      });

      await expect(loadSponsorKeyMaterial(cfg)).rejects.toThrow(
        'KMS decryption returned empty plaintext'
      );
    });

    test('throws ConfigurationError when KMS config is incomplete', async () => {
      const cfg = createBaseConfig({
        seedEncryptionMode: 'kms',
        kmsKeyId: undefined,
        kmsRegion: 'us-east-1',
        encryptedSeedPath: '/path/to/encrypted.bin',
      });

      await expect(loadSponsorKeyMaterial(cfg)).rejects.toThrow(
        'KMS_KEY_ID, KMS_REGION, and ENCRYPTED_SEED_PATH are required'
      );
    });
  });

  describe('encryptSeedWithPassphrase / decryptWithPassphrase', () => {
    test('round-trips correctly', () => {
      const seed = 'test mnemonic phrase for encryption round-trip';
      const passphrase = 'super-secret-passphrase';

      const encrypted = encryptSeedWithPassphrase(seed, passphrase);
      const decrypted = decryptWithPassphrase(encrypted, passphrase);

      expect(decrypted).toBe(seed);
    });

    test('fails with wrong passphrase', () => {
      const seed = 'test mnemonic phrase';
      const encrypted = encryptSeedWithPassphrase(seed, 'correct-passphrase');

      expect(() => decryptWithPassphrase(encrypted, 'wrong-passphrase')).toThrow();
    });

    test('throws on corrupted data', () => {
      expect(() => decryptWithPassphrase(Buffer.from('short'), 'pass')).toThrow(
        'Encrypted seed file is too short or corrupted'
      );
    });
  });
});
