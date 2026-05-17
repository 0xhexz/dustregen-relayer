import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { firstValueFrom } from 'rxjs';
import { deserializeUnbalanced, serializeBalanced } from '../../transaction/codec';
import { waitForWalletSync, verifyDustRegistration, SponsorWallet } from '../../wallet/sponsor';
import { SponsorMutex, ISponsorMutex } from '../../queue/mutex';
import { TransactionParseError, InsufficientDUSTBalanceError, InsufficientFeeError, BalanceError, InvalidContractError } from '../../errors';
import { NetworkConfig } from '../../config/network';
import { isContractWhitelisted } from '../../config/registry';

export const SponsorRequestSchema = z.object({
  unbalancedTx: z.string().regex(/^[0-9a-fA-F]+$/, 'must be hex'),
});

export type SponsorRequest = z.infer<typeof SponsorRequestSchema>;

export type SponsorResponse =
  | { ok: true; balancedTx: string; estimatedFee: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export function createSponsorRouter(
  cfg: NetworkConfig,
  sponsor: SponsorWallet,
  mutex: ISponsorMutex,
): Router {
  const router = Router();

  router.post('/sponsor', async (req: Request, res: Response, next: NextFunction) => {
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

      // Run exclusively through the mutex
      const result = await mutex.runExclusive('sponsor', async () => {
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

        // Try to balance the transaction
        try {
          const balanced = await sponsor.wallet.balanceUnsealedTransaction(tx, {
            tokenKindsToBalance: ['dust'],
            changeOutputDestination: sponsor.publicKey,
            additionalFeeOverhead: cfg.additionalFeeOverhead,
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
          };
        } catch (e) {
          if (e instanceof InsufficientFeeError || e instanceof InsufficientDUSTBalanceError) throw e;
          throw new BalanceError(
            `balanceUnsealedTransaction failed: ${(e as Error).message}`,
            { cause: (e as Error).message }
          );
        }
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
