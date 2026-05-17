#!/usr/bin/env node
import { Command } from 'commander';
import { loadNetworkConfig } from './config/network.js';
import { loadSponsorKeyMaterial } from './config/key-loader.js';
import { buildSponsorWallet } from './wallet/sponsor.js';
import { fastSyncSponsorWallet } from './wallet/fast-sync.js';
import { createSponsorMutex } from './queue/mutex.js';
import { DustUtxoPool, UTXO_SPLIT_AMOUNT, REPLENISH_COUNT } from './wallet/utxo-pool.js';
import { DustUtxoSplitter } from './wallet/utxo-splitter.js';
import { PoolAllocator } from './queue/pool-allocator.js';
import { DustMonitor } from './monitor/dust.js';
import { DustRefillDaemon } from './monitor/refill-daemon.js';
import { createRelayerApp } from './relayer/server.js';
import { runSimulatorFlow } from './simulator/flow.js';
import { createLogger } from './logger.js';
import { RelayerError } from './errors.js';

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
  const cfg = loadNetworkConfig();
  const seed = await loadSponsorKeyMaterial(cfg);
  const logger = createLogger('dustregen-relayer', [seed]);
  try {
    // Fast-sync wallet state from indexer if enabled (parallel indexed queries
    // instead of block-by-block scanning for rapid startup)
    if (process.env.FAST_SYNC_ENABLED === 'true') {
      logger.info('Fast-syncing sponsor wallet from indexer...');
      const syncResult = await fastSyncSponsorWallet(cfg.indexerUrl, cfg.contractAddress);
      logger.info('Fast-sync complete', {
        syncedToBlock: syncResult.syncedToBlock.toString(),
        nullifiers: syncResult.nullifiers.length,
        allocations: syncResult.generatedAllocations.length,
      });
    }

    const sponsor = await buildSponsorWallet(cfg);
    const mutex = createSponsorMutex(logger, process.env.REDIS_URL);
    const monitor = new DustMonitor(
      () => null,
      logger,
    );
    monitor.start();

    // Set up auto-refill daemon
    const refillDaemon = new DustRefillDaemon({
      wallet: sponsor,
      config: cfg,
      logger,
      monitor,
    });
    refillDaemon.start();

    // Set up UTXO pool for parallel sponsor processing
    const utxoPool = new DustUtxoPool(async () => {
      // In production, this would execute a self-spend splitting transaction
      const utxos = [];
      for (let i = 0; i < REPLENISH_COUNT; i++) {
        utxos.push({ utxoId: `utxo-${Date.now()}-${i}`, amount: UTXO_SPLIT_AMOUNT });
      }
      return utxos;
    });

    const splitter = new DustUtxoSplitter(utxoPool, 30_000, logger);
    splitter.start();

    const poolAllocator = new PoolAllocator(utxoPool, logger);

    const app = createRelayerApp(cfg, sponsor, mutex, monitor, poolAllocator);
    const server = app.listen(cfg.relayerPort, () => {
      logger.info(`Relayer listening on port ${cfg.relayerPort}`);
    });

    // Graceful shutdown
    const shutdown = () => {
      logger.info('Shutting down relayer...');
      refillDaemon.stop();
      splitter.stop();
      monitor.stop();
      server.close();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
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
