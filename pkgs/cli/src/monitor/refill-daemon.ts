import { DustMonitor, computeRefillAmount, LOW_DUST_THRESHOLD_SPECKS, SPECKS_PER_DUST, STARS_PER_NIGHT } from './dust';
import { sendWebhookAlert } from './webhooks';
import { SponsorWallet } from '../wallet/sponsor';
import { NetworkConfig } from '../config/network';
import { Logger } from '../logger';

export interface DustRefillDaemonOpts {
  wallet: SponsorWallet;
  config: NetworkConfig;
  logger: Logger;
  monitor: DustMonitor;
  getNightBalance?: () => bigint;
  submitRefillTx?: () => Promise<string>;
}

export class DustRefillDaemon {
  private readonly wallet: SponsorWallet;
  private readonly config: NetworkConfig;
  private readonly logger: Logger;
  private readonly monitor: DustMonitor;
  private readonly getNightBalance: () => bigint;
  private readonly submitRefillTx: () => Promise<string>;
  private started = false;

  constructor(opts: DustRefillDaemonOpts) {
    this.wallet = opts.wallet;
    this.config = opts.config;
    this.logger = opts.logger;
    this.monitor = opts.monitor;
    this.getNightBalance = opts.getNightBalance ?? (() => {
      const snapshot = this.monitor.current();
      return snapshot?.nightStars ?? 0n;
    });
    this.submitRefillTx = opts.submitRefillTx ?? (async () => {
      return this.defaultSubmitRefillTx();
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.monitor.enableAutoRefill({
      submitRefillTx: async () => {
        const txId = await this.submitRefillTx();
        this.emitWebhook('refill_success', `Auto-refill transaction submitted: ${txId}`, { txId });
        return txId;
      },
      getNightBalance: this.getNightBalance,
      logger: this.logger,
    });

    this.logger.info('DustRefillDaemon started');
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.monitor.disableAutoRefill();
    this.logger.info('DustRefillDaemon stopped');
  }

  private async defaultSubmitRefillTx(): Promise<string> {
    // Construct a DustRegistration backdate transaction using unspent NIGHT UTXOs
    const tx = {
      type: 'DustRegistrationBackdate',
      cNightInput: true,
      timestamp: new Date().toISOString(),
    };

    // Balance the transaction via the wallet
    const balanced = await this.wallet.wallet.balanceUnsealedTransaction(tx, {
      tokenKindsToBalance: ['dust', 'night'],
      changeOutputDestination: this.wallet.nativeAddress,
      additionalFeeOverhead: this.config.additionalFeeOverhead,
    });

    // Submit the balanced transaction to the network via node RPC.
    // The wallet's balanceUnsealedTransaction returns the balanced tx which
    // must then be submitted. We use the node RPC endpoint from config.
    const balancedTx = balanced as any;
    const txPayload = JSON.stringify(balancedTx);
    const submitUrl = `${this.config.nodeRpcUrl}/submit`;
    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: txPayload,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      throw new Error(`Transaction submission failed (${response.status}): ${errorBody}`);
    }

    const result = await response.json().catch(() => ({}));
    const txId = (result as any).txId ?? `refill-tx-${Date.now()}`;
    this.logger.info('Refill transaction submitted to network', { txId, submitUrl });
    return txId;
  }

  private emitWebhook(type: string, message: string, details: Record<string, unknown>): void {
    sendWebhookAlert({
      type: type as any,
      message,
      details,
      timestamp: new Date().toISOString(),
    }).catch((err) => {
      this.logger.warn('Failed to send refill webhook', { error: (err as Error).message });
    });
  }
}
