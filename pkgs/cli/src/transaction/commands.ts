import { Command } from 'commander';
import { createLogger } from '../config/logger';
import { sponsorTransaction } from './sponsor';
import { buildTransaction } from './builder';

const logger = createLogger('transaction');

export const transactionCommands = new Command('transaction')
  .description('Transaction management commands')
  .addCommand(
    new Command('sponsor')
      .description('Sponsor a transaction with gas fees')
      .requiredOption('-u, --user <string>', 'User address (hex)')
      .requiredOption('-a, --amount <string>', 'Gas amount in DUST')
      .requiredOption('-s, --signature <string>', 'User signature')
      .action(async (options) => {
        try {
          logger.info(`Sponsoring transaction for user: ${options.user}`);
          
          const result = await sponsorTransaction({
            user: options.user,
            gasAmount: BigInt(options.amount),
            userSignature: options.signature
          });
          
          console.log('Transaction sponsored successfully:');
          console.log(`  Transaction ID: ${result.transactionId}`);
          console.log(`  Sponsored Amount: ${result.sponsoredAmount} DUST`);
          console.log(`  Status: ${result.status}`);
          
        } catch (error) {
          logger.error('Transaction sponsorship failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('build')
      .description('Build a transaction without submitting')
      .requiredOption('-t, --type <string>', 'Transaction type (sponsor|deposit|update)')
      .option('-u, --user <string>', 'User address (for sponsor type)')
      .option('-a, --amount <string>', 'Amount (for sponsor/deposit types)')
      .option('-s, --signature <string>', 'User signature (for sponsor type)')
      .option('-f, --fee <string>', 'New fee percentage (for update type)')
      .action(async (options) => {
        try {
          logger.info(`Building ${options.type} transaction`);
          
          const tx = await buildTransaction(options.type, {
            user: options.user,
            amount: options.amount ? BigInt(options.amount) : undefined,
            signature: options.signature,
            fee: options.fee ? parseInt(options.fee) : undefined
          });
          
          console.log('Transaction built successfully:');
          console.log(JSON.stringify(tx, null, 2));
          
        } catch (error) {
          logger.error('Failed to build transaction:', error);
          process.exit(1);
        }
      })
  );