import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { NetworkConfig } from './network';
import { ConfigurationError } from '../errors';

/**
 * Load the sponsor key material based on the configured seed encryption mode.
 * Returns the decrypted mnemonic seed - all decrypted material stays in-memory only.
 */
export async function loadSponsorKeyMaterial(cfg: NetworkConfig): Promise<string> {
  switch (cfg.seedEncryptionMode) {
    case 'plaintext':
      return loadPlaintext(cfg);
    case 'kms':
      return loadFromKms(cfg);
    case 'passphrase':
      return loadFromPassphrase(cfg);
    default:
      throw new ConfigurationError(
        `Unsupported seed encryption mode: ${cfg.seedEncryptionMode}`
      );
  }
}

function loadPlaintext(cfg: NetworkConfig): string {
  if (!cfg.sponsorSeed) {
    throw new ConfigurationError('SPONSOR_SEED is required when seedEncryptionMode is plaintext');
  }
  // eslint-disable-next-line no-console
  console.warn('[DEPRECATION] Loading seed in plaintext mode. Use kms or passphrase mode for production.');
  return cfg.sponsorSeed;
}

async function loadFromKms(cfg: NetworkConfig): Promise<string> {
  if (!cfg.kmsKeyId || !cfg.kmsRegion || !cfg.encryptedSeedPath) {
    throw new ConfigurationError(
      'KMS_KEY_ID, KMS_REGION, and ENCRYPTED_SEED_PATH are required when seedEncryptionMode is kms'
    );
  }

  const encryptedData = fs.readFileSync(cfg.encryptedSeedPath);
  const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
  const client = new KMSClient({ region: cfg.kmsRegion });
  const command = new DecryptCommand({
    CiphertextBlob: new Uint8Array(encryptedData),
    KeyId: cfg.kmsKeyId,
  });

  const response = await client.send(command);
  if (!response.Plaintext) {
    throw new ConfigurationError('KMS decryption returned empty plaintext');
  }

  return Buffer.from(response.Plaintext).toString('utf-8');
}

async function loadFromPassphrase(cfg: NetworkConfig): Promise<string> {
  if (!cfg.encryptedSeedPath) {
    throw new ConfigurationError(
      'ENCRYPTED_SEED_PATH is required when seedEncryptionMode is passphrase'
    );
  }

  const clack = await import('@clack/prompts');
  const passphraseResult = await clack.password({
    message: 'Enter passphrase to decrypt sponsor seed:',
  });

  if (clack.isCancel(passphraseResult) || !passphraseResult) {
    throw new ConfigurationError('Passphrase input was cancelled');
  }

  const passphrase = passphraseResult as string;
  const encryptedData = fs.readFileSync(cfg.encryptedSeedPath);

  return decryptWithPassphrase(encryptedData, passphrase);
}

/**
 * Decrypt data that was encrypted with encryptSeedWithPassphrase.
 * Format: [16-byte salt][12-byte IV][16-byte auth tag][ciphertext]
 */
export function decryptWithPassphrase(encryptedData: Buffer, passphrase: string): string {
  if (encryptedData.length < 44) {
    throw new ConfigurationError('Encrypted seed file is too short or corrupted');
  }

  const salt = encryptedData.subarray(0, 16);
  const iv = encryptedData.subarray(16, 28);
  const authTag = encryptedData.subarray(28, 44);
  const ciphertext = encryptedData.subarray(44);

  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Encrypt a seed with a passphrase using aes-256-gcm with scrypt key derivation.
 * Output format: [16-byte salt][12-byte IV][16-byte auth tag][ciphertext]
 */
export function encryptSeedWithPassphrase(seed: string, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(seed, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, authTag, encrypted]);
}
