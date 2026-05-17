#!/usr/bin/env node
import { Command } from 'commander';
import { loadNetworkConfig } from './config/network';
import { buildSponsorWallet } from './wallet/sponsor';
import { createSponsorMutex } from './queue/mutex';
import { DustMonitor } from './monitor/dust';
import { createRelayerApp } from './relayer/server';
import { runSimulatorFlow } from './simulator/flow';
import { createLogger } from './logger';
import { RelayerError } from './errors';

const program = new Command();

program
  .name('dustregen')
  .description('DustRegen Relayer - Sponsored Gas Relayer for Midnight Network')
  .version('1.0.0');

program
  .command('relayer')
  .description('Start the relayer server')
  .action(async () => {
    await startRelayer();
  });

program
  .command('simulate')
  .description('Run the end-to-end simulator flow')
  .action(async () => {
    await startSimulator();
  });

async function startRelayer(): Promise<void> {
  const logger = createLogger('dustregen-relayer');
  try {
    const cfg = loadNetworkConfig();
    const sponsor = await buildSponsorWallet(cfg);
    const mutex = createSponsorMutex(logger, process.env.REDIS_URL);
    const monitor = new DustMonitor(
      () => null,
      logger,
    );
    monitor.start();

    const app = createRelayerApp(cfg, sponsor, mutex, monitor);
    app.listen(cfg.relayerPort, () => {
      logger.info(`Relayer listening on port ${cfg.relayerPort}`);
    });
  } catch (err) {
    logger.error('Failed to start relayer', { error: (err as Error).message });
    process.exit(1);
  }
}

async function startSimulator(): Promise<void> {
  try {
    const cfg = loadNetworkConfig();
    await runSimulatorFlow(cfg);
  } catch (err) {
    if (err instanceof RelayerError) {
      console.error(`Simulator failed [${err.code}]: ${err.message}`);
      process.exit(1);
    }
    console.error('Simulator failed:', (err as Error).message);
    process.exit(1);
  }
}

async function showInteractiveMenu(): Promise<void> {
  const clack = await import('@clack/prompts');
  const chalk = (await import('chalk')).default;

  clack.intro(chalk.magenta('🌌 WELCOME TO DUSTREGEN SPONSOR RELAYER 🌌'));

  while (true) {
    const action = await clack.select({
      message: 'What would you like to do?',
      options: [
        { value: 'relayer', label: '🚀 Start Paymaster Relayer' },
        { value: 'simulate', label: '🧪 Run 6-Step Gasless E2E Simulation' },
        { value: 'exit', label: '❌ Exit' },
      ],
    });

    if (clack.isCancel(action) || action === 'exit') {
      clack.outro(chalk.magenta('Goodbye! 🌌'));
      process.exit(0);
    }

    if (action === 'relayer') {
      await startRelayer();
      break;
    }

    if (action === 'simulate') {
      await startSimulator();
    }
  }
}

// If no arguments provided (just the binary name), show interactive menu
const userArgs = process.argv.slice(2);
if (userArgs.length === 0) {
  showInteractiveMenu().catch((err) => {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  });
} else {
  program.parse(process.argv);
}
