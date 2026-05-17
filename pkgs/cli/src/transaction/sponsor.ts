import { createLogger } from '../config/logger';
import { waitForWalletSync, signTransaction, submitTransaction } from '../wallet/manager';
import { validateSponsorshipRequest } from '@dustregen/contract';
import { balanceUnsealedTransaction } from '@midnight-ntwrk/dapp-connector-api';

const logger = createLogger('sponsor');

export interface SponsorshipRequest {
  user: string;
  gasAmount: bigint;
  userSignature: string;
}

export interface SponsorshipResult {
  transactionId: string;
  sponsoredAmount: bigint;
  status: string;
}

export async function sponsorTransaction(request: SponsorshipRequest): Promise<SponsorshipResult> {
  try {
    // Validate request
    if (!validateSponsorshipRequest(request)) {
      throw new Error('Invalid sponsorship request');
    }
    
    logger.info(`Processing sponsorship for ${request.user}, amount: ${request.gasAmount}`);
    
    // Wait for wallet sync (CRITICAL: per midnight-rules.md)
    await waitForWalletSync();
    
    // Build sponsorship transaction
    const transaction = await buildSponsorshipTransaction(request);
    
    // Balance the transaction (unsealed for contract interaction)
    const balancedTx = await balanceUnsealedTransaction(transaction);
    
    // Sign and submit
    const signedTx = await signTransaction(balancedTx);
    const txId = await submitTransaction(signedTx);
    
    logger.info(`Transaction submitted: ${txId}`);
    
    return {
      transactionId: txId,
      sponsoredAmount: request.gasAmount,
      status: 'submitted'
    };
    
  } catch (error) {
    logger.error('Sponsorship failed:', error);
    throw error;
  }
}

async function buildSponsorshipTransaction(request: SponsorshipRequest): Promise<any> {
  // Build transaction for DustRegenRelayer contract
  return {
    type: 'contract_call',
    contract: 'DustRegenRelayer',
    function: 'sponsorTransaction',
    arguments: [
      request.user,
      request.gasAmount.toString(),
      request.userSignature
    ],
    gasLimit: 1000000,
    nonce: Date.now() // In production, use proper nonce management
  };
}

export async function validateUserSignature(
  user: string,
  signature: string,
  message: string
): Promise<boolean> {
  // In production, implement proper signature verification
  // This is a placeholder for the actual verification logic
  logger.debug(`Validating signature for user: ${user}`);
  return true;
}