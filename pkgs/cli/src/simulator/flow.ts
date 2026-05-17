import { NetworkConfig } from '../config/network';
import { buildEphemeralUserWallet, EphemeralUserWallet } from '../wallet/user';
import { waitForWalletSync } from '../wallet/sponsor';
import { serializeUnbalanced, UnbalancedTransaction } from '../transaction/codec';
import { signBalancedTx } from '../transaction/sign';
import { NetworkSubmissionError } from '../errors';
import { SPECKS_PER_DUST } from '../monitor/dust';

export interface SimulatorDeps {
  buildWallet?: (cfg: NetworkConfig) => Promise<EphemeralUserWallet>;
  postSponsor?: (url: string, body: unknown) => Promise<{ ok: boolean; balancedTx: string; estimatedFee: string }>;
  submitTx?: (nodeUrl: string, signedTxHex: string) => Promise<string>;
  pollFinalization?: (nodeUrl: string, txId: string, intervalMs: number, timeoutMs: number) => Promise<{ feePaid: bigint }>;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 120000;

/**
 * Poll the PreProd node for transaction finalization.
 * Returns the receipt once finalized.
 */
export async function pollForFinalization(
  nodeUrl: string,
  txId: string,
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs: number = DEFAULT_POLL_TIMEOUT_MS,
): Promise<{ feePaid: bigint }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${nodeUrl}/transactions/${txId}/receipt`);

    if (response.ok) {
      const receipt = (await response.json()) as { status: string; feePaid?: string };
      if (receipt.status === 'finalized') {
        return { feePaid: BigInt(receipt.feePaid ?? '0') };
      }
    }

    if (Date.now() + intervalMs >= deadline) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new NetworkSubmissionError(
    `Transaction ${txId} did not finalize within ${timeoutMs}ms`,
    { txId, timeoutMs },
  );
}

/**
 * Construct an incrementCounter() call against the deployed test contract,
 * producing an UnbalancedTransaction.
 */
function buildIncrementCounterTx(contractAddress: string): UnbalancedTransaction {
  return {
    type: 'unbalanced',
    inputs: [],
    outputs: [],
    contractCall: {
      address: contractAddress,
      circuit: 'incrementCounter',
      args: [],
    },
  };
}

/**
 * Run the complete 6-step simulator flow:
 * 1. Build ephemeral user wallet
 * 2. Wait for wallet sync
 * 3. Construct incrementCounter() call
 * 4. Serialize and POST to /sponsor
 * 5. Sign balanced transaction
 * 6. Submit to node and poll for finalization
 */
export async function runSimulatorFlow(
  cfg: NetworkConfig,
  deps: SimulatorDeps = {},
): Promise<void> {
  const {
    buildWallet = buildEphemeralUserWallet,
    postSponsor = defaultPostSponsor,
    submitTx = defaultSubmitTx,
    pollFinalization: pollFn = pollForFinalization,
  } = deps;

  // Step 1: Build ephemeral user wallet (fresh, zero balances)
  const user = await buildWallet(cfg);

  try {
    // Step 2: Wait for wallet sync against indexer
    await waitForWalletSync(user.wallet, cfg.walletSyncTimeoutMs);

    // Step 3: Construct incrementCounter() call
    const unbalancedTx = buildIncrementCounterTx(cfg.contractAddress);

    // Step 4: Serialize and POST to /sponsor endpoint
    const unbalancedHex = serializeUnbalanced(unbalancedTx);
    const sponsorUrl = `http://localhost:${cfg.relayerPort}/sponsor`;
    const sponsorResponse = await postSponsor(sponsorUrl, { unbalancedTx: unbalancedHex });

    if (!sponsorResponse.ok) {
      throw new NetworkSubmissionError(
        'Sponsor endpoint returned an error',
        sponsorResponse,
      );
    }

    // Step 5: Sign the balanced transaction
    const signedTxHex = await signBalancedTx(user.wallet as any, sponsorResponse.balancedTx);

    // Step 6: Submit signed tx and poll for finalization
    const txId = await submitTx(cfg.nodeRpcUrl, signedTxHex);
    const receipt = await pollFn(cfg.nodeRpcUrl, txId, DEFAULT_POLL_INTERVAL_MS, DEFAULT_POLL_TIMEOUT_MS);

    // Print fee paid in DUST with full precision
    const feeDust = Number(receipt.feePaid) / Number(SPECKS_PER_DUST);
    console.log(`Transaction ${txId} finalized. Fee paid: ${feeDust} DUST (${receipt.feePaid} Specks)`);
  } finally {
    await user.close();
  }
}

async function defaultPostSponsor(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; balancedTx: string; estimatedFee: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as { ok?: boolean; balancedTx?: string; estimatedFee?: string; error?: unknown };

  if (!response.ok || !json.ok) {
    return { ok: false, balancedTx: '', estimatedFee: '0', ...json } as { ok: boolean; balancedTx: string; estimatedFee: string };
  }

  return { ok: true, balancedTx: json.balancedTx ?? '', estimatedFee: json.estimatedFee ?? '0' };
}

async function defaultSubmitTx(nodeUrl: string, signedTxHex: string): Promise<string> {
  const response = await fetch(`${nodeUrl}/transactions/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTx: signedTxHex }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new NetworkSubmissionError(
      `Failed to submit transaction: ${response.status} ${errorText}`,
      { status: response.status },
    );
  }

  const result = (await response.json()) as { txId: string };
  return result.txId;
}
