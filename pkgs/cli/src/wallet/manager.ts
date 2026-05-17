import { Wallet } from '@midnight-ntwrk/wallet';
import { createLogger } from '../config/logger';

const logger = createLogger('wallet');

let walletInstance: Wallet | null = null;

export async function initializeWallet(mnemonic?: string): Promise<Wallet> {
  try {
    if (walletInstance) {
      logger.warn('Wallet already initialized');
      return walletInstance;
    }
    
    // In production, use secure storage for mnemonic
    const wallet = await Wallet.create({
      mnemonic,
      network: 'testnet-02'
    });
    
    walletInstance = wallet;
    logger.info('Wallet initialized successfully');
    return wallet;
  } catch (error) {
    logger.error('Failed to initialize wallet:', error);
    throw error;
  }
}

export async function getWallet(wallet?: Wallet): Promise<Wallet> {
  if (wallet) return wallet;
  if (walletInstance) return walletInstance;
  
  throw new Error('Wallet not initialized. Run "wallet init" first.');
}

export async function getWalletAddress(wallet?: Wallet): Promise<string> {
  const w = await getWallet(wallet);
  return await w.getAddress();
}

export async function getWalletBalance(wallet?: Wallet): Promise<bigint> {
  const w = await getWallet(wallet);
  await waitForWalletSync(w);
  return await w.getBalance();
}

export async function waitForWalletSync(wallet?: Wallet): Promise<void> {
  const w = await getWallet(wallet);
  logger.info('Waiting for wallet sync...');
  await w.waitForSync();
  logger.info('Wallet sync complete');
}

export async function signTransaction(
  transaction: any,
  wallet?: Wallet
): Promise<string> {
  const w = await getWallet(wallet);
  await waitForWalletSync(w);
  return await w.signTransaction(transaction);
}

export async function submitTransaction(
  signedTransaction: string,
  wallet?: Wallet
): Promise<string> {
  const w = await getWallet(wallet);
  return await w.submitTransaction(signedTransaction);
}