import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { firstValueFrom } from 'rxjs';
import { deserializeUnbalanced, serializeBalanced } from '../../transaction/codec';
import { waitForWalletSync, verifyDustRegistration, SponsorWallet } from '../../wallet/sponsor';
import { ISponsorMutex, IPoolAllocator } from '../../queue/mutex';
import { TransactionParseError, InsufficientDUSTBalanceError, InsufficientFeeError, BalanceError, InvalidContractError } from '../../errors';
import { NetworkConfig } from '../../config/network';
import { isContractWhitelisted } from '../../config/registry';
import { DustMonitor } from '../../monitor/dust';
import { RelayerMetrics } from '../metrics';
import { computeDynamicFeeSafetyMargin } from '../../fees/dynamic-fee';

export const SponsorRequestSchema = z.object({
  unbalancedTx: z.string().regex(/^[0-9a-fA-F]+$/, 'must be hex'),
});

export type SponsorRequest = z.infer<typeof SponsorRequestSchema>;

export type SponsorResponse =
  | { ok: true; balancedTx: string; estimatedFee: string; feeSafetyMargin: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export function createSponsorRouter(
  cfg: NetworkConfig,
  sponsor: SponsorWallet,
  mutex: ISponsorMutex,
  metrics: RelayerMetrics,
  monitor: DustMonitor,
  poolAllocator?: IPoolAllocator,
): Router {
  const router = Router();

  router.post('/sponsor', async (req: Request, res: Response, next: NextFunction) => {
    monitor.recordRequest();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      // Validate request body
      const parsed = SponsorRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new TransactionParseError('Invalid request body', { zodErrors: parsed.error.flatten() });
      }

      // Deserialize the unbalanced transaction
      const tx = deserializeUnbalanced(parsed.data.unbalancedTx);

      // Validate contract address against whitelist
      if (tx.contractCall?.address && !isContractWhitelisted(tx.contractCall.address)) {
        throw new InvalidContractError('Contract address is not whitelisted', { address: tx.contractCall.address });
      }

      // Wait for wallet sync
      await waitForWalletSync(sponsor.wallet, cfg.walletSyncTimeoutMs);

      // Use pool allocator if available, otherwise fall back to mutex
      const sponsorFn = async () => {
        // Get current wallet state and verify DUST
        const state = await firstValueFrom(sponsor.wallet.state());

        const dustBalance = state.balances?.dust ?? 0n;
        const overhead = cfg.additionalFeeOverhead;

        // Check if we have enough DUST to even cover the overhead
        if (dustBalance < overhead) {
          throw new InsufficientDUSTBalanceError(
            `Sponsor DUST balance (${dustBalance}) is below minimum overhead (${overhead})`,
            { dustBalance: dustBalance.toString(), overhead: overhead.toString() }
          );
        }

        // Compute dynamic fee safety margin, falling back to static value on failure
        let feeSafetyMargin: bigint;
        try {
          feeSafetyMargin = await computeDynamicFeeSafetyMargin(cfg.indexerUrl);
        } catch {
          feeSafetyMargin = cfg.additionalFeeOverhead;
        }

        // Try to balance the transaction
        try {
          const balanced = await sponsor.wallet.balanceUnsealedTransaction(tx, {
            tokenKindsToBalance: ['dust'],
            changeOutputDestination: sponsor.publicKey,
            additionalFeeOverhead: feeSafetyMargin,
          });

          const balancedTx = balanced as any;
          const estimatedFee = balancedTx.estimatedFee ?? 0n;

          // After balancing, check if the fee exceeds what we can cover
          if (dustBalance < estimatedFee + overhead) {
            throw new InsufficientFeeError(
              `Sponsor DUST balance (${dustBalance}) cannot cover fee (${estimatedFee}) + overhead (${overhead})`,
              { dustBalance: dustBalance.toString(), estimatedFee: estimatedFee.toString(), overhead: overhead.toString() }
            );
          }

          return {
            ok: true as const,
            balancedTx: serializeBalanced({
              type: 'balanced',
              inputs: balancedTx.inputs || [],
              outputs: balancedTx.outputs || [],
              contractCall: balancedTx.contractCall,
              estimatedFee: BigInt(estimatedFee),
            }),
            estimatedFee: estimatedFee.toString(),
            feeSafetyMargin: feeSafetyMargin.toString(),
          };
        } catch (e) {
          if (e instanceof InsufficientFeeError || e instanceof InsufficientDUSTBalanceError) throw e;
          throw new BalanceError(
            `balanceUnsealedTransaction failed: ${(e as Error).message}`,
            { cause: (e as Error).message }
          );
        }
      };

      let result;
      if (poolAllocator) {
        const allocation = await poolAllocator.acquireUtxo(requestId);
        try {
          result = await sponsorFn();
        } finally {
          await poolAllocator.releaseUtxo(requestId);
        }
      } else {
        result = await mutex.runExclusive('sponsor', sponsorFn);
      }

      metrics.totalSponsored++;
      res.json(result);
    } catch (err) {
      metrics.totalFailed++;
      next(err);
    }
  });

  return router;
}
