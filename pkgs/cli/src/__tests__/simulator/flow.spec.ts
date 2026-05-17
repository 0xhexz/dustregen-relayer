import request from 'supertest';
import { Express } from 'express';
import { createRelayerApp } from '../../relayer/server.js';
import { runSimulatorFlow, SimulatorDeps } from '../../simulator/flow.js';
import { NetworkConfig } from '../../config/network.js';
import { SponsorMutex } from '../../queue/mutex.js';
import { DustMonitor } from '../../monitor/dust.js';
import { SponsorWallet, Wallet, WalletState } from '../../wallet/sponsor.js';
import { serializeBalanced, BalancedTransaction } from '../../transaction/codec.js';
import { of } from 'rxjs';

function createMockWalletState(): WalletState {
  return {
    syncProgress: { synced: true },
    balances: { dust: 10000000000000000n, night: 5000000n },
    registrations: [{ type: 'DustRegistration', active: true, cNightInput: true }],
  };
}

function createMockWallet(): Wallet {
  return {
    state: () => of(createMockWalletState()),
    balanceUnsealedTransaction: jest.fn().mockResolvedValue({
      type: 'balanced',
      inputs: [{ tokenKind: 'dust', amount: '1000', source: 'sponsor' }],
      outputs: [{ destination: 'user', tokenKind: 'dust', amount: '500' }],
      contractCall: { address: '0x1234', circuit: 'incrementCounter', args: [] },
      estimatedFee: 500n,
    }),
    sign: jest.fn().mockImplementation((tx: any) => Promise.resolve(tx)),
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

function createTestConfig(port: number = 0): NetworkConfig {
  return {
    networkId: 'PreProd',
    nodeRpcUrl: 'http://localhost:9944',
    indexerUrl: 'http://localhost:8080',
    indexerWsUrl: 'ws://localhost:8080',
    proofServerUrl: 'http://localhost:6300',
    contractAddress: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    sponsorSeed: 'test-seed-phrase-not-real',
    privateStateDir: './.test-state',
    walletSyncTimeoutMs: 5000,
    relayerPort: port,
    additionalFeeOverhead: 1000n,
  };
}

describe('Simulator Flow', () => {
  describe('createRelayerApp', () => {
    let app: Express;
    let sponsorWallet: SponsorWallet;
    let mutex: SponsorMutex;
    let monitor: DustMonitor;

    beforeEach(() => {
      sponsorWallet = createMockSponsorWallet();
      mutex = new SponsorMutex();
      monitor = new DustMonitor(() => null, { warn: jest.fn() });
      app = createRelayerApp(createTestConfig(), sponsorWallet, mutex, monitor);
    });

    test('GET /health returns service status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('dustregen-relayer');
      expect(res.body.pending).toBe(0);
    });

    test('POST /sponsor with valid unbalanced tx returns balanced tx', async () => {
      const unbalancedTx = {
        type: 'unbalanced',
        inputs: [],
        outputs: [],
        contractCall: { address: '0x1234', circuit: 'incrementCounter', args: [] },
      };
      const hex = Buffer.from(JSON.stringify(unbalancedTx), 'utf8').toString('hex');

      const res = await request(app)
        .post('/sponsor')
        .send({ unbalancedTx: hex });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.balancedTx).toBeDefined();
      expect(typeof res.body.balancedTx).toBe('string');
      expect(res.body.estimatedFee).toBeDefined();
    });

    test('POST /sponsor with invalid hex returns 400', async () => {
      const res = await request(app)
        .post('/sponsor')
        .send({ unbalancedTx: 'not-valid-hex!!!' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('TransactionParseError');
    });
  });

  describe('runSimulatorFlow', () => {
    test('executes full 6-step flow with mocked deps', async () => {
      const cfg = createTestConfig(3999);

      const mockBalancedTx: BalancedTransaction = {
        type: 'balanced',
        inputs: [{ tokenKind: 'dust', amount: '1000', source: 'sponsor' }],
        outputs: [{ destination: 'user', tokenKind: 'dust', amount: '500' }],
        contractCall: { address: '0x1234', circuit: 'incrementCounter', args: [] },
        estimatedFee: 500n,
      };
      const balancedHex = serializeBalanced(mockBalancedTx);

      const mockUserWallet = createMockWallet();
      const buildWallet = jest.fn().mockResolvedValue({
        wallet: mockUserWallet,
        secretKey: new Uint8Array(32),
        publicKey: 'mock-user-pubkey',
        nativeAddress: 'mock-user-native-addr',
        close: jest.fn().mockResolvedValue(undefined),
      });

      const postSponsor = jest.fn().mockResolvedValue({
        ok: true,
        balancedTx: balancedHex,
        estimatedFee: '500',
      });

      const submitTx = jest.fn().mockResolvedValue('mock-tx-id-123');

      const pollFinalization = jest.fn().mockResolvedValue({
        feePaid: 450n,
      });

      const deps: SimulatorDeps = {
        buildWallet,
        postSponsor,
        submitTx,
        pollFinalization,
      };

      await runSimulatorFlow(cfg, deps);

      // Verify step 1: build wallet was called
      expect(buildWallet).toHaveBeenCalledWith(cfg);

      // Verify step 4: POST to /sponsor was called with serialized hex
      expect(postSponsor).toHaveBeenCalledTimes(1);
      const [sponsorUrl, sponsorBody] = postSponsor.mock.calls[0];
      expect(sponsorUrl).toBe(`http://localhost:${cfg.relayerPort}/sponsor`);
      expect((sponsorBody as any).unbalancedTx).toBeDefined();

      // Verify step 6: submit and poll were called
      expect(submitTx).toHaveBeenCalledWith(cfg.nodeRpcUrl, expect.any(String));
      expect(pollFinalization).toHaveBeenCalledWith(
        cfg.nodeRpcUrl,
        'mock-tx-id-123',
        expect.any(Number),
        expect.any(Number),
      );
    });

    test('throws NetworkSubmissionError if sponsor returns error', async () => {
      const cfg = createTestConfig(3999);

      const buildWallet = jest.fn().mockResolvedValue({
        wallet: createMockWallet(),
        secretKey: new Uint8Array(32),
        publicKey: 'mock-user-pubkey',
        nativeAddress: 'mock-user-native-addr',
        close: jest.fn().mockResolvedValue(undefined),
      });

      const postSponsor = jest.fn().mockResolvedValue({
        ok: false,
        error: { code: 'InsufficientDUSTBalanceError', message: 'Not enough DUST' },
      });

      const deps: SimulatorDeps = {
        buildWallet,
        postSponsor,
      };

      await expect(runSimulatorFlow(cfg, deps)).rejects.toThrow('Sponsor endpoint returned an error');
    });

    test('cleans up user wallet even on failure', async () => {
      const cfg = createTestConfig(3999);
      const closeFn = jest.fn().mockResolvedValue(undefined);

      const buildWallet = jest.fn().mockResolvedValue({
        wallet: createMockWallet(),
        secretKey: new Uint8Array(32),
        publicKey: 'mock-user-pubkey',
        nativeAddress: 'mock-user-native-addr',
        close: closeFn,
      });

      const postSponsor = jest.fn().mockRejectedValue(new Error('Network error'));

      const deps: SimulatorDeps = {
        buildWallet,
        postSponsor,
      };

      await expect(runSimulatorFlow(cfg, deps)).rejects.toThrow('Network error');
      expect(closeFn).toHaveBeenCalled();
    });
  });
});
