import { runSimulatorFlow } from '../../simulator/flow';
import { loadNetworkConfig, NetworkConfig } from '../../config/network';
import { SPECKS_PER_DUST } from '../../monitor/dust';

const RUN_PREVIEW_E2E = process.env.RUN_PREVIEW_E2E === '1';

const describeOrSkip = RUN_PREVIEW_E2E ? describe : describe.skip;

describeOrSkip('Preview E2E Integration', () => {
  let cfg: NetworkConfig;

  beforeAll(() => {
    cfg = loadNetworkConfig();
  });

  test('full simulator flow against live Preview node finalizes with non-zero DUST fee', async () => {
    await runSimulatorFlow(cfg);
  }, 180000);

  test('DUST fee is non-zero and within expected bounds', async () => {
    let capturedFee: bigint = 0n;

    const pollFinalization = async (nodeUrl: string, txId: string, intervalMs: number, timeoutMs: number) => {
      const { pollForFinalization } = await import('../../simulator/flow');
      const receipt = await pollForFinalization(nodeUrl, txId, intervalMs, timeoutMs);
      capturedFee = receipt.feePaid;
      return receipt;
    };

    await runSimulatorFlow(cfg, { pollFinalization });

    expect(capturedFee).toBeGreaterThan(0n);

    // Fee should not exceed expectedFee + additionalFeeOverhead
    // Using a generous upper bound for the E2E test
    const maxExpectedFee = cfg.additionalFeeOverhead * 100n;
    expect(capturedFee).toBeLessThanOrEqual(maxExpectedFee);
  }, 180000);
});
