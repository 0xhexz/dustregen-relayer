import { Command } from 'commander';
import { createLogger } from '../config/logger';
import { 
  initializeWallet, 
  getWalletAddress,
  getWalletBalance,
  waitForWalletSync 
} from './manager';

const logger = createLogger('wallet');

export const walletCommands = new Command('wallet')
  .description('Wallet management commands')
  .addCommand(
    new Command('init')
      .description('Initialize wallet with mnemonic')
      .option('-m, --mnemonic <string>', 'Mnemonic phrase (optional)')
      .action(async (options) => {
        try {
          logger.info('Initializing wallet...');
          const wallet = await initializeWallet(options.mnemonic);
          const address = await getWalletAddress(wallet);
          logger.info(`Wallet initialized: ${address}`);
        } catch (error) {
          logger.error('Failed to initialize wallet:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('address')
      .description('Get wallet address')
      .action(async () => {
        try {
          const address = await getWalletAddress();
          console.log(`Wallet address: ${address}`);
        } catch (error) {
          logger.error('Failed to get wallet address:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('balance')
      .description('Get wallet balance')
      .action(async () => {
        try {
          await waitForWalletSync();
          const balance = await getWalletBalance();
          console.log(`Wallet balance: ${balance} DUST`);
        } catch (error) {
          logger.error('Failed to get wallet balance:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('sync')
      .description('Wait for wallet sync')
      .action(async () => {
        try {
          logger.info('Waiting for wallet sync...');
          await waitForWalletSync();
          logger.info('Wallet sync complete');
        } catch (error) {
          logger.error('Wallet sync failed:', error);
          process.exit(1);
        }
      })
  );