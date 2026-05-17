import { Command } from 'commander';
import { createLogger } from './logger';
import fs from 'fs';
import path from 'path';

const logger = createLogger('config');

export const configCommands = new Command('config')
  .description('Configuration management commands')
  .addCommand(
    new Command('init')
      .description('Initialize configuration file')
      .action(() => {
        try {
          const configPath = path.join(process.cwd(), '.dustregen.config.json');
          const defaultConfig = {
            network: 'testnet-02',
            relayer: {
              port: 3000,
              host: 'localhost',
              feePercentage: 0,
              minSponsorshipAmount: '1000',
              maxSponsorshipAmount: '1000000'
            },
            wallet: {
              mnemonic: '', // Should be set via environment variable
              derivationPath: "m/44'/60'/0'/0/0"
            },
            contract: {
              address: '', // Will be set after deployment
              abi: 'DustRegenRelayer'
            },
            logging: {
              level: 'info',
              file: 'dustregen.log'
            }
          };
          
          fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
          logger.info(`Configuration file created: ${configPath}`);
          console.log('Please update the configuration file with your settings.');
          
        } catch (error) {
          logger.error('Failed to create configuration file:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show current configuration')
      .action(() => {
        try {
          const configPath = path.join(process.cwd(), '.dustregen.config.json');
          
          if (!fs.existsSync(configPath)) {
            console.log('Configuration file not found. Run "config init" first.');
            return;
          }
          
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          console.log(JSON.stringify(config, null, 2));
          
        } catch (error) {
          logger.error('Failed to read configuration:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('validate')
      .description('Validate configuration')
      .action(() => {
        try {
          const configPath = path.join(process.cwd(), '.dustregen.config.json');
          
          if (!fs.existsSync(configPath)) {
            console.log('❌ Configuration file not found');
            process.exit(1);
          }
          
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          const errors: string[] = [];
          
          // Validate network
          if (!['testnet-02', 'mainnet'].includes(config.network)) {
            errors.push('Invalid network. Must be "testnet-02" or "mainnet"');
          }
          
          // Validate relayer config
          if (config.relayer.feePercentage < 0 || config.relayer.feePercentage > 100) {
            errors.push('Fee percentage must be between 0 and 100');
          }
          
          if (parseInt(config.relayer.minSponsorshipAmount) <= 0) {
            errors.push('Minimum sponsorship amount must be positive');
          }
          
          if (parseInt(config.relayer.maxSponsorshipAmount) <= parseInt(config.relayer.minSponsorshipAmount)) {
            errors.push('Maximum sponsorship amount must be greater than minimum');
          }
          
          // Validate port
          if (config.relayer.port < 1 || config.relayer.port > 65535) {
            errors.push('Port must be between 1 and 65535');
          }
          
          if (errors.length === 0) {
            console.log('✅ Configuration is valid');
          } else {
            console.log('❌ Configuration validation failed:');
            errors.forEach(error => console.log(`  - ${error}`));
            process.exit(1);
          }
          
        } catch (error) {
          logger.error('Configuration validation failed:', error);
          process.exit(1);
        }
      })
  );