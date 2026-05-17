import { DustMonitor, LOW_DUST_THRESHOLD_SPECKS, SPECKS_PER_DUST, computeRefillAmount } from '../monitor/dust.js';
import { DustRefillDaemon } from '../monitor/refill-daemon.js';
import { SponsorWallet, Wallet } from '../wallet/sponsor.js';
import { NetworkConfig } from '../config/network.js';
import { of } from 'rxjs';

jest.mock('../monitor/webhooks.js', () => ({
  sendWebhookAlert: jest.fn().mockResolvedValue(undefined),
}));

function createMockWallet(): Wallet {
  return {
    state: () => of({ syncProgress: { synced: true }, balances: { dust: 10000000000000000n, night: 5000000n } }),
    balanceUnsealedTransaction: jest.fn().mockResolvedValue({}),
  };
}

function createMockSponsorWallet(): SponsorWallet {
  const wallet = createMockWallet();
  return {
    wallet,
    publicKey: 'mock-sponsor-pubkey',
    nativeAddress: 'mock-sponsor-native-addr',
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function createTestConfig(): NetworkConfig {
  return {
    networkId: 'PreProd',
    nodeRpcUrl: 'http://localhost:9944',
    indexerUrl: 'http://localhost:8080',
    indexerWsUrl: 'ws://localhost:8080',
    proofServerUrl: 'http://localhost:6300',
    contractAddress: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    sponsorSeed: 'test-seed-phrase',
    privateStateDir: './.test-state',
    walletSyncTimeoutMs: 5000,
    relayerPort: 3000,
    additionalFeeOverhead: 1000n,
    seedEncryptionMode: 'plaintext',
  };
}

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as any;
}

describe('DustRefillDaemon', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('refill triggers', () => {
    test('refill triggers when dust is below threshold', async () => {
      const lowDustSpecks = LOW_DUST_THRESHOLD_SPECKS - 1n;
      const nightStars = 1_000_000n;

      const monitor = new DustMonitor(
        () => ({ nightStars, dustSpecks: lowDustSpecks }),
        { warn: jest.fn() }
      );

      const submitRefillTx = jest.fn().mockResolvedValue('tx-123');
      const logger = createMockLogger();

      const daemon = new DustRefillDaemon({
        wallet: createMockSponsorWallet(),
        config: createTestConfig(),
        logger,
        monitor,
        getNightBalance: () => nightStars,
        submitRefillTx,
      });

      daemon.start();
      monitor.start(100);

      // Advance to trigger tick
      jest.advanceTimersByTime(200);

      // Allow async operations to flush
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(submitRefillTx).toHaveBeenCalledTimes(1);

      daemon.stop();
      monitor.stop();
    });

    test('refill does NOT trigger when dust is above threshold', async () => {
      const highDustSpecks = LOW_DUST_THRESHOLD_SPECKS + SPECKS_PER_DUST;
      const nightStars = 1_000_000n;

      const monitor = new DustMonitor(
        () => ({ nightStars, dustSpecks: highDustSpecks }),
        { warn: jest.fn() }
      );

      const submitRefillTx = jest.fn().mockResolvedValue('tx-123');
      const logger = createMockLogger();

      const daemon = new DustRefillDaemon({
        wallet: createMockSponsorWallet(),
        config: createTestConfig(),
        logger,
        monitor,
        getNightBalance: () => nightStars,
        submitRefillTx,
      });

      daemon.start();
      monitor.start(100);

      jest.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();

      expect(submitRefillTx).not.toHaveBeenCalled();

      daemon.stop();
      monitor.stop();
    });

    test('cooldown prevents rapid-fire refill attempts', async () => {
      const lowDustSpecks = LOW_DUST_THRESHOLD_SPECKS - 1n;
      const nightStars = 1_000_000n;

      const monitor = new DustMonitor(
        () => ({ nightStars, dustSpecks: lowDustSpecks }),
        { warn: jest.fn() }
      );

      const submitRefillTx = jest.fn().mockResolvedValue('tx-456');
      const logger = createMockLogger();

      const daemon = new DustRefillDaemon({
        wallet: createMockSponsorWallet(),
        config: createTestConfig(),
        logger,
        monitor,
        getNightBalance: () => nightStars,
        submitRefillTx,
      });

      daemon.start();
      monitor.start(100);

      // First tick triggers refill
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(submitRefillTx).toHaveBeenCalledTimes(1);

      // Subsequent ticks within cooldown should NOT trigger
      jest.advanceTimersByTime(5000); // 5 seconds, well within 60s cooldown
      await Promise.resolve();
      await Promise.resolve();

      expect(submitRefillTx).toHaveBeenCalledTimes(1); // Still only 1

      daemon.stop();
      monitor.stop();
    });

    test('handles transaction submission errors gracefully', async () => {
      const lowDustSpecks = LOW_DUST_THRESHOLD_SPECKS - 1n;
      const nightStars = 1_000_000n;

      const monitor = new DustMonitor(
        () => ({ nightStars, dustSpecks: lowDustSpecks }),
        { warn: jest.fn() }
      );

      const submitRefillTx = jest.fn().mockRejectedValue(new Error('Network timeout'));
      const logger = createMockLogger();

      const daemon = new DustRefillDaemon({
        wallet: createMockSponsorWallet(),
        config: createTestConfig(),
        logger,
        monitor,
        getNightBalance: () => nightStars,
        submitRefillTx,
      });

      daemon.start();
      monitor.start(100);

      jest.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Should not throw - error is caught and logged
      expect(submitRefillTx).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Auto-refill failed',
        expect.objectContaining({ error: 'Network timeout' })
      );

      daemon.stop();
      monitor.stop();
    });
  });

  describe('lifecycle', () => {
    test('start enables auto-refill on monitor', () => {
      const monitor = new DustMonitor(() => null, { warn: jest.fn() });
      const logger = createMockLogger();

      const daemon = new DustRefillDaemon({
        wallet: createMockSponsorWallet(),
        config: createTestConfig(),
        logger,
        monitor,
        getNightBalance: () => 0n,
        submitRefillTx: jest.fn().mockResolvedValue('tx'),
      });

      daemon.start();
      expect(logger.info).toHaveBeenCalledWith('DustRefillDaemon started');

      daemon.stop();
      expect(logger.info).toHaveBeenCalledWith('DustRefillDaemon stopped');
    });

    test('stop disables auto-refill on monitor', async () => {
      const lowDustSpecks = LOW_DUST_THRESHOLD_SPECKS - 1n;
      const monitor = new DustMonitor(
        () => ({ nightStars: 1_000_000n, dustSpecks: lowDustSpecks }),
        { warn: jest.fn() }
      );

      const submitRefillTx = jest.fn().mockResolvedValue('tx-789');
      const logger = createMockLogger();

      const daemon = new DustRefillDaemon({
        wallet: createMockSponsorWallet(),
        config: createTestConfig(),
        logger,
        monitor,
        getNightBalance: () => 1_000_000n,
        submitRefillTx,
      });

      daemon.start();
      daemon.stop();

      monitor.start(100);
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();

      // After stop, refill should not be called
      expect(submitRefillTx).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe('computeRefillAmount', () => {
    test('returns min(5 * V_NIGHT, R_g * V_Star * delta_t)', () => {
      const nightStars = 1_000_000n; // 1 NIGHT
      const deltaSeconds = 3600n; // 1 hour

      const result = computeRefillAmount(nightStars, deltaSeconds);

      // maxRefill = 5 * 1_000_000 * 10^15 / 10^6 = 5 * 10^15
      // regenRefill = 8267 * 1_000_000 * 3600 = 29_761_200_000_000
      // min of those two
      const maxRefill = 5n * nightStars * SPECKS_PER_DUST / 1_000_000n;
      const regenRefill = 8267n * nightStars * deltaSeconds;
      const expected = maxRefill < regenRefill ? maxRefill : regenRefill;

      expect(result).toBe(expected);
    });

    test('returns zero for zero night balance', () => {
      const result = computeRefillAmount(0n, 3600n);
      expect(result).toBe(0n);
    });

    test('caps at maxRefill for large delta', () => {
      const nightStars = 1_000_000n;
      const deltaSeconds = 1_000_000n; // Very large delta

      const result = computeRefillAmount(nightStars, deltaSeconds);

      const maxRefill = 5n * nightStars * SPECKS_PER_DUST / 1_000_000n;
      expect(result).toBe(maxRefill);
    });
  });
});
