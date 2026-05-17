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
    // In production, this would construct a DustRegistration backdate transaction
    // using unspent NIGHT UTXOs from the sponsor wallet
    const tx = {
      type: 'DustRegistrationBackdate',
      cNightInput: true,
      timestamp: new Date().toISOString(),
    };

    // Submit via wallet's balanceUnsealedTransaction
    const result = await this.wallet.wallet.balanceUnsealedTransaction(tx, {
      tokenKindsToBalance: ['dust', 'night'],
      changeOutputDestination: this.wallet.nativeAddress,
      additionalFeeOverhead: this.config.additionalFeeOverhead,
    });

    return `refill-tx-${Date.now()}`;
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
