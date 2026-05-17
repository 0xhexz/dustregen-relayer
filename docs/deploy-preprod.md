# Deploying to Midnight Pre-Production (PreProd) Testnet

This guide covers deploying and operating the DustRegen Relayer on the Midnight PreProd testnet.

## Minting cNIGHT for the Sponsor

The sponsor wallet needs NIGHT tokens to generate DUST for gas sponsorship.

1. Install the Midnight Lace wallet browser extension.
2. Create or import a wallet and switch to the PreProd network.
3. Use the PreProd faucet to request testnet NIGHT tokens:
   - Navigate to the Midnight Discord or documentation portal for the current faucet URL.
   - Request tokens to your sponsor wallet's native address.
4. Confirm receipt by checking your wallet balance in Lace or via the indexer.

The sponsor mnemonic (12 or 24 words) is the value you place in `SPONSOR_SEED` in your `.env` file.

## Deploying the Test Contract

The `test-call.compact` contract is already compiled under `pkgs/contract/src/managed/test-call/`. To deploy a fresh instance:

1. Ensure your sponsor wallet has NIGHT (for the deployment transaction fee).
2. Use the Midnight CLI or SDK to deploy the compiled contract:

```bash
# Example using the Midnight deployment tooling
midnight deploy --contract pkgs/contract/src/managed/test-call/ --network preprod
```

3. Record the returned contract address (a 64-character hex string).
4. Set `CONTRACT_ADDRESS` in your `.env` file to this value.

If you are using an existing deployed contract instance, simply copy its address into your configuration.

## Sizing Sponsor DUST Capacity

DUST regenerates from NIGHT holdings at a fixed rate:

- **5 DUST per NIGHT** is the maximum DUST capacity
- DUST regenerates over time up to this capacity
- Each sponsored transaction consumes DUST proportional to its proof complexity

Recommendations:

- For development and testing, 10-50 NIGHT provides 50-250 DUST capacity, sufficient for dozens of test transactions.
- For sustained operation, ensure the sponsor holds enough NIGHT that the DUST capacity exceeds expected peak load. Monitor the DustMonitor logs for low-DUST warnings.
- The low-DUST threshold is 0.5 DUST (half a full DUST unit). Below this level, the relayer logs warnings and may reject new sponsorship requests.

## Starting the Relayer

1. Ensure `.env` is configured with all required values:

```bash
cp .env.example .env
# Edit .env with your CONTRACT_ADDRESS and SPONSOR_SEED
```

2. Install dependencies and build:

```bash
npm install
npm run build
```

3. Start the relayer:

```bash
npm run dev relayer
```

The relayer will:
- Restore the sponsor wallet from the configured seed
- Sync wallet state from the network (this may take 30-120 seconds on first run)
- Start the DustMonitor to track DUST regeneration
- Listen on `RELAYER_PORT` (default 3000) for sponsorship requests

## Restart Procedure

The sponsor wallet persists its private state (witness data, coin sets) in a LevelDB database at the path specified by `PRIVATE_STATE_DIR` (default: `./.sponsor-state`).

To restart without re-syncing from genesis:

1. **Preserve the LevelDB directory** - do not delete `./.sponsor-state` between restarts.
2. Stop the relayer process gracefully (SIGTERM or Ctrl+C).
3. Restart with the same `PRIVATE_STATE_DIR` path.

The wallet will resume synchronization from its last checkpoint rather than re-downloading the full chain state.

If you need to reset state (e.g., after a testnet wipe or contract redeployment):

```bash
rm -rf ./.sponsor-state
npm run dev relayer
```

This forces a full re-sync from genesis, which may take several minutes.

## Low-DUST Runbook

When the sponsor's DUST balance falls below the 0.5 DUST threshold:

### Symptoms

- DustMonitor logs warnings: `[DustMonitor] LOW DUST: balance below threshold`
- The `/health` endpoint reports `isLowDust: true` in its DUST snapshot
- Sponsorship requests may fail with `InsufficientDUSTBalanceError`

### Diagnosis

1. Check the relayer logs for DustMonitor output:

```
[DustMonitor] DUST snapshot: { specks: 250000, capacityPct: 0.10, isLowDust: true }
```

2. Query the `/health` endpoint:

```bash
curl http://localhost:3000/health
```

3. Verify the sponsor's NIGHT balance has not been depleted (DUST capacity is derived from NIGHT holdings).

### Resolution

1. **Top up the sponsor wallet** - send additional NIGHT tokens to the sponsor's native address using the faucet or a transfer from another wallet.
2. **Wait for regeneration** - DUST regenerates over time up to the capacity determined by NIGHT holdings. If the sponsor still holds NIGHT, DUST will naturally recover.
3. **Reduce load** - if the relayer is under heavy use, consider rate-limiting clients or temporarily pausing the simulator.

After topping up, the DustMonitor will automatically detect the increased balance and clear the low-DUST warning. No restart is required.
