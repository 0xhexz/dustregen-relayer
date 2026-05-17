#!/usr/bin/env node

import { Command } from 'commander';
import { startRelayer } from './relayer/server';
import { walletCommands } from './wallet/commands';
import { transactionCommands } from './transaction/commands';
import { configCommands } from './config/commands';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('dustregen')
  .description('DustRegen Relayer CLI for Midnight Network')
  .version('1.0.0');

// Add command groups
program.addCommand(walletCommands);
program.addCommand(transactionCommands);
program.addCommand(configCommands);

// Start relayer command
program
  .command('start')
  .description('Start the relayer service')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .option('-h, --host <string>', 'Host to bind to', 'localhost')
  .action(async (options) => {
    console.log(`Starting DustRegen Relayer on ${options.host}:${options.port}`);
    await startRelayer(parseInt(options.port), options.host);
  });

// Parse command line arguments
program.parse(process.argv);