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
  });

program
  .command('simulate')
  .description('Run the end-to-end simulator flow')
  .action(async () => {
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
  });

program.parse(process.argv);
