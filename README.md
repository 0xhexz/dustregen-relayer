# DustRegen Relayer

A sponsored gas relayer for Midnight Network Preview testnet. It enables unfunded user wallets (zero NIGHT, zero DUST) to execute contract calls by having a persistent sponsor wallet inject DUST inputs into the user's unbalanced transaction. The user signs locally and never surrenders custody of their keys.

## Prerequisites

- Node.js >= 18
- npm
- `compactc` 0.31.0 (optional - the contract is already compiled under `pkgs/contract/src/managed/`)

## Project Structure

```
dustregen-relayer/
├── pkgs/
│   ├── contract/            # Compact smart contract + compiled bindings
│   │   ├── src/
│   │   │   ├── test-call.compact
│   │   │   └── managed/    # Generated TypeScript bindings, ZK keys, ZKIR
│   │   └── package.json
│   └── cli/                 # Express relayer service + CLI simulator
│       ├── src/
│       │   ├── index.ts         # Commander entry point (relayer | simulate)
│       │   ├── config/          # Network config, logger
│       │   ├── wallet/          # Sponsor and ephemeral user wallet builders
│       │   ├── transaction/     # Codec (serialize/deserialize), sign helpers
│       │   ├── queue/           # SponsorMutex (FIFO exclusive access)
│       │   ├── relayer/         # Express app, routes, middleware
│       │   ├── monitor/         # DustMonitor (battery-level tracking)
│       │   ├── simulator/       # End-to-end sponsorship flow
│       │   └── __tests__/       # Unit and property-based tests
│       └── package.json
├── docs/                    # Deployment and operational guides
├── .env.example             # Environment variable template
├── package.json             # Monorepo root (npm workspaces)
└── tsconfig.json
```

## Install

```bash
npm install
```

## Configure

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Fill in the values:
   - `CONTRACT_ADDRESS` - your deployed test-call contract address
   - `SPONSOR_SEED` - 12-word mnemonic for the sponsor wallet (must hold NIGHT to generate DUST)

See `.env.example` for all available configuration variables.

## Build

```bash
npm run build
```

This compiles TypeScript in both `pkgs/contract` and `pkgs/cli`.

## Run Relayer

Start the sponsored gas relayer service:

```bash
npm run dev relayer
```

Or from the compiled output:

```bash
node pkgs/cli/dist/index.js relayer
```

The relayer listens on `RELAYER_PORT` (default 3000) and exposes:
- `POST /sponsor` - accepts an unbalanced transaction, returns a balanced transaction with DUST inputs
- `GET /health` - returns mutex queue depth and DUST battery snapshot

## Run Simulator

Run the end-to-end simulator that exercises the full sponsorship flow:

```bash
npm run dev simulate
```

The simulator builds an ephemeral user wallet, constructs a contract call, posts to the relayer for DUST balancing, signs locally, and submits the finalized transaction to the Preview node.

## Test

Run all tests across the monorepo:

```bash
npm test
```

Run only the CLI workspace tests:

```bash
npm test -w pkgs/cli
```

Run integration tests against live Preview (requires configured `.env` with real credentials):

```bash
RUN_PREVIEW_E2E=1 npm test -w pkgs/cli
```

## Architecture

For detailed design documentation, see [`.kiro/specs/dust-regen-relayer/design.md`](.kiro/specs/dust-regen-relayer/design.md).

Key components:

- **Express Relayer** - HTTP server that accepts unbalanced transactions, injects sponsor DUST, and returns balanced transactions
- **SponsorMutex** - FIFO exclusive lock serializing balance operations to prevent UTXO collisions
- **DustMonitor** - Battery-model tracker that monitors the sponsor's DUST regeneration and alerts on low balance
- **CLI Simulator** - End-to-end flow that exercises the complete sponsorship cycle for testing

## Security

- Seed phrases are never logged or exposed in error messages
- User signing keys never leave the user's process (non-custodial design)
- All HTTP input is validated via zod schemas before processing
- DUST change is always routed back to the sponsor's public key

## License

MIT
