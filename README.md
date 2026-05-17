# DustRegen Relayer

**Enterprise-grade Sponsored Gas Relayer for Midnight Network PreProd**

DustRegen Relayer enables users with **zero DUST** (no gas) to execute smart contract transactions on the Midnight blockchain. A funded Sponsor Wallet automatically injects DUST fees into user transactions while the user retains full custody of their private keys.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Running](#running)
- [Dashboard](#dashboard)
- [Deployment](#deployment)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## How It Works

Midnight uses a "Battery Model" for gas:

- **NIGHT** (staking token) generates **DUST** (gas token) over time
- 1 NIGHT generates up to 5 DUST maximum capacity
- Regeneration rate: 8,267 Specks per Star per second
- DUST cannot be transferred, only spent as gas

**The Problem:** New users have 0 DUST and cannot pay gas fees.

**The Solution:** DustRegen Relayer sponsors gas fees on behalf of users:

```
User (0 DUST) ──> Builds unsigned tx ──> POST /sponsor ──> Relayer adds DUST
                                                                    │
User signs locally <── Balanced tx returned <─────────────────────────
      │
      └──> Submits to Midnight PreProd ──> Finalized on-chain
```

The user's private key **never** leaves their device.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              DustRegen Relayer Process           │
│                                                 │
│  ┌───────────┐  ┌──────────────┐  ┌─────────┐  │
│  │  Express  │  │ UTXO Pool    │  │  DUST   │  │
│  │  Server   │  │ (50x 0.1     │  │ Monitor │  │
│  │           │  │  DUST each)  │  │         │  │
│  │ POST      │  └──────────────┘  │ Refill  │  │
│  │ /sponsor  │                    │ Daemon  │  │
│  │ /health   │  ┌──────────────┐  └─────────┘  │
│  └───────────┘  │ Queue        │               │
│                 │ (Mutex or    │  ┌─────────┐  │
│  ┌───────────┐  │  Redlock)    │  │ Webhook │  │
│  │ Rate      │  └──────────────┘  │ Alerts  │  │
│  │ Limiter   │                    └─────────┘  │
│  └───────────┘  ┌──────────────┐               │
│                 │ Sponsor      │               │
│  ┌───────────┐  │ Wallet       │               │
│  │ Contract  │  │ (LevelDB)    │               │
│  │ Registry  │  └──────────────┘               │
│  └───────────┘                                  │
└─────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────┐      ┌──────────────┐
│  Midnight   │      │   Redis      │
│  PreProd    │      │  (optional)  │
│  Network    │      └──────────────┘
└─────────────┘
```

---

## Features

### Core Engine
- **Gasless Transactions** - Users with 0 DUST can execute contract calls
- **Non-Custodial** - User keys never leave their local process
- **FIFO Queue** - Sequential processing prevents UTXO collisions
- **Dynamic Fees** - Ledger v8 `compute_maximum_price_adjustment` for precise fee calculation

### High-Concurrency (Enterprise)
- **UTXO Pool** - Pre-split 50x UTXOs of 0.1 DUST for parallel processing
- **Pool Allocator** - Unique UTXO per request, bypassing single-flight bottleneck
- **UTXO Splitter Daemon** - Auto-replenishes pool when available UTXOs drop below 10
- **Distributed Lock** - Redis-based Redlock for multi-instance deployments

### Monitoring & Alerts
- **DUST Monitor** - Real-time battery model calculation (capacity, regen rate)
- **Webhook Alerts** - Slack/Discord notifications for low balance and request spikes
- **Auto-Refill Daemon** - Autonomous DustRegistration backdate when balance < 0.5 DUST
- **Visual Dashboard** - Browser-based real-time monitoring (Tailwind + Chart.js)

### Security
- **AES-256-GCM** encrypted seed storage with scrypt key derivation (N=131072)
- **AWS KMS** integration for production key management
- **Passphrase mode** - Interactive decryption prompt at boot
- **Log Redaction** - Seeds, mnemonics, and private keys never appear in logs
- **Rate Limiting** - 10 req/15min per IP, 5 req/hr per address
- **Contract Whitelist** - Only approved contracts can be sponsored

### Developer Experience
- **Interactive TUI** - Arrow-key menu with @clack/prompts
- **Colored Output** - Animated spinners (ora) and styled text (chalk)
- **Global CLI** - `npm link` and run `dustregen` from anywhere
- **Fast-Sync** - Indexed queries instead of block-by-block scanning (< 30s startup)
- **Local WASM Proving** - No deprecated HTTP prover dependency

---

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Redis (optional, for multi-instance mode)

### Install

```bash
git clone https://github.com/0xhexz/dustregen-relayer.git
cd dustregen-relayer
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your values (see Configuration section below)
```

### Build

```bash
npm run build
```

### Register Global CLI

```bash
cd pkgs/cli
npm link
```

### Run

```bash
# Interactive mode (recommended)
dustregen

# Or direct commands
dustregen relayer     # Start the relayer server
dustregen simulate   # Run 6-step E2E simulation
```

---

## Configuration

Copy `.env.example` to `.env` and configure:

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NETWORK_ID` | Must be `PreProd` | `PreProd` |
| `NODE_RPC_URL` | Midnight node RPC endpoint | `https://rpc.preprod.midnight.network` |
| `INDEXER_URL` | GraphQL indexer endpoint | `https://indexer.preprod.midnight.network/api/v4/graphql` |
| `INDEXER_WS_URL` | WebSocket indexer endpoint | `wss://indexer.preprod.midnight.network/api/v4/graphql/ws` |
| `PROOF_SERVER_URL` | ZK proof server | `https://lace-proof-pub.preprod.midnight.network` |
| `CONTRACT_ADDRESS` | Deployed contract address | `0x1234...abcd` |
| `SPONSOR_SEED` | Mnemonic (plaintext mode only) | `word1 word2 ... word12` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAYER_PORT` | `3000` | Express server port |
| `PRIVATE_STATE_DIR` | `./.sponsor-state` | LevelDB storage path |
| `WALLET_SYNC_TIMEOUT_MS` | `120000` | Wallet sync timeout |
| `ADDITIONAL_FEE_OVERHEAD` | `1000` | Extra fee buffer (Specks) |
| `REDIS_URL` | _(none)_ | Enables distributed Redlock mode |
| `SLACK_WEBHOOK_URL` | _(none)_ | Slack alert webhook |
| `DISCORD_WEBHOOK_URL` | _(none)_ | Discord alert webhook |
| `WHITELISTED_CONTRACTS` | _(none)_ | Comma-separated contract addresses |
| `FAST_SYNC_ENABLED` | `false` | Enable indexed fast-sync on boot |
| `SEED_ENCRYPTION_MODE` | `plaintext` | `plaintext`, `kms`, or `passphrase` |
| `ENCRYPTED_SEED_PATH` | _(none)_ | Path to encrypted seed file |
| `KMS_KEY_ID` | _(none)_ | AWS KMS key ID |
| `KMS_REGION` | _(none)_ | AWS region for KMS |

### Seed Encryption Modes

| Mode | Use Case | Setup |
|------|----------|-------|
| `plaintext` | Development only | Set `SPONSOR_SEED` directly |
| `passphrase` | Small deployments | Encrypt seed file, enter passphrase at boot |
| `kms` | Production (AWS) | Store encrypted seed, configure KMS key |

---

## Running

### Interactive Mode

```bash
dustregen
```

Shows a beautiful TUI with arrow-key navigation:

```
🌌 WELCOME TO DUSTREGEN SPONSOR RELAYER 🌌

? What would you like to do?
  🚀 Start Paymaster Relayer
  🧪 Run 6-Step Gasless E2E Simulation
  ❌ Exit
```

### Start Relayer Server

```bash
dustregen relayer
```

Starts the Express server with:
- `POST /sponsor` - Submit unbalanced transactions for sponsorship
- `GET /health` - Service status, DUST balance, queue depth
- Dashboard at `/` - Visual monitoring UI

### Run E2E Simulation

```bash
dustregen simulate
```

Executes the full 6-step gasless flow with animated output:
1. Creates ephemeral wallet (0 NIGHT, 0 DUST)
2. Syncs wallet against indexer
3. Builds `incrementCounter()` contract call
4. POSTs unbalanced tx to `/sponsor`
5. Signs balanced tx locally
6. Submits to PreProd and polls for finalization

### API Usage

```bash
# Sponsor a transaction
curl -X POST http://localhost:3000/sponsor \
  -H "Content-Type: application/json" \
  -d '{"unbalancedTx": "deadbeef..."}'

# Response (success)
{
  "ok": true,
  "balancedTx": "cafebabe...",
  "estimatedFee": "1500"
}

# Response (error)
{
  "ok": false,
  "error": {
    "code": "InsufficientDUSTBalanceError",
    "message": "Sponsor DUST balance too low"
  }
}
```

---

## Dashboard

Access the visual monitoring dashboard at `http://localhost:3000/` after starting the relayer.

Displays:
- DUST balance gauge (current vs max capacity)
- Queue status (locked/unlocked, pending count)
- Transaction metrics (total sponsored, failed, success rate)
- Balance history chart (live updates every 10s)

---

## Deployment

### Docker (Recommended)

```bash
# Start relayer + Redis
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f relayer
```

The LevelDB state is persisted to a named Docker volume (`sponsor_private_state`), so container restarts do not require re-syncing from genesis.

### PM2 (VPS)

```bash
# Install PM2 globally
npm install -g pm2

# Start with ecosystem config
pm2 start ecosystem.config.json

# Monitor
pm2 monit
```

### Manual

```bash
npm run build
node pkgs/cli/dist/index.js relayer
```

---

## Testing

```bash
# Run all tests
npm test

# Run CLI tests only
npm test -w pkgs/cli

# Run E2E integration test (requires live PreProd access)
RUN_PREPROD_E2E=1 npm test -w pkgs/cli
```

**Test coverage:**
- 57 tests passing across 7 test suites
- Property-based tests (fast-check, 100+ iterations)
- Unit tests for UTXO pool, dynamic fees, key encryption, fast-sync, refill daemon
- Component tests for Express routes with mocked wallet
- E2E integration test (gated, uses live PreProd network)

---

## Project Structure

```
dustregen-relayer/
├── pkgs/
│   ├── contract/                    # Compact smart contract
│   │   ├── src/
│   │   │   ├── test-call.compact   # incrementCounter() contract
│   │   │   └── managed/test-call/  # Compiled bindings (compactc 0.31.0)
│   │   └── package.json
│   │
│   └── cli/                         # Relayer + CLI
│       ├── src/
│       │   ├── index.ts             # Entry point (TUI + Commander)
│       │   ├── errors.ts            # Typed error hierarchy
│       │   ├── logger.ts            # Redacting Winston logger
│       │   │
│       │   ├── config/
│       │   │   ├── network.ts       # NetworkConfig loader + validation
│       │   │   ├── registry.ts      # Contract address whitelist
│       │   │   └── key-loader.ts    # KMS / passphrase seed decryption
│       │   │
│       │   ├── wallet/
│       │   │   ├── sponsor.ts       # Persistent sponsor wallet (LevelDB)
│       │   │   ├── user.ts          # Ephemeral user wallet (in-memory)
│       │   │   ├── utxo-pool.ts     # Pre-split UTXO pool (50x 0.1 DUST)
│       │   │   ├── utxo-splitter.ts # Auto-replenish daemon
│       │   │   ├── fast-sync.ts     # Indexed fast-sync protocol
│       │   │   └── proving-provider.ts # WASM-based ZK proving (v4.0.0)
│       │   │
│       │   ├── fees/
│       │   │   └── dynamic-fee.ts   # Ledger v8 price adjustment
│       │   │
│       │   ├── queue/
│       │   │   ├── mutex.ts         # FIFO mutex (async-mutex + Redlock)
│       │   │   └── pool-allocator.ts # Parallel UTXO allocation
│       │   │
│       │   ├── relayer/
│       │   │   ├── server.ts        # Express app factory
│       │   │   ├── routes/sponsor.ts # POST /sponsor handler
│       │   │   ├── middleware.ts    # Error middleware
│       │   │   ├── rateLimit.ts     # IP + address rate limiting
│       │   │   └── metrics.ts       # Request metrics
│       │   │
│       │   ├── monitor/
│       │   │   ├── dust.ts          # DustMonitor + battery constants
│       │   │   ├── webhooks.ts      # Slack/Discord alerts
│       │   │   └── refill-daemon.ts # Autonomous DUST refill
│       │   │
│       │   ├── transaction/
│       │   │   ├── codec.ts         # Hex serialize/deserialize
│       │   │   └── sign.ts          # User-side signing
│       │   │
│       │   ├── simulator/
│       │   │   └── flow.ts          # 6-step E2E simulation
│       │   │
│       │   └── __tests__/           # Jest test suites
│       │
│       └── public/
│           └── dashboard.html       # Visual monitoring dashboard
│
├── docs/
│   └── deploy-preprod.md            # Deployment guide
│
├── Dockerfile                       # Multi-stage production build
├── docker-compose.prod.yml          # Relayer + Redis stack
├── ecosystem.config.json            # PM2 process config
├── .env.example                     # Environment template
├── package.json                     # Monorepo root (workspaces)
└── tsconfig.json                    # Root TypeScript config
```

---

## Security

| Concern | Protection |
|---------|-----------|
| Sponsor seed exposure | AES-256-GCM encryption, AWS KMS, log redaction |
| User key custody | Keys never leave user process |
| Input validation | Zod schema validation on all requests |
| Malformed transactions | `TransactionParseError` with hex validation |
| Contract abuse | Whitelist-only sponsorship |
| DDoS / abuse | Rate limiting (IP + address based) |
| UTXO collisions | FIFO mutex or Redlock distributed lock |
| Log leaks | Regex redaction of seed/mnemonic/private/Authorization |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `WalletSyncTimeoutError` | Increase `WALLET_SYNC_TIMEOUT_MS` or check indexer connectivity |
| `InsufficientDUSTBalanceError` | Wait for DUST regeneration or add more NIGHT to sponsor |
| `PoolExhaustedError` | All 50 UTXOs in use; reduce concurrency or wait |
| `InvalidContractError` | Add contract address to `WHITELISTED_CONTRACTS` |
| `ConfigurationError` | Check `.env` values; all URLs must be valid |
| Slow startup | Enable `FAST_SYNC_ENABLED=true` for indexed sync |
| Redis connection failed | Relayer falls back to local async-mutex automatically |

---

## Battery Model Reference

```
1 NIGHT = 1,000,000 Stars
1 DUST  = 1,000,000,000,000,000 Specks (10^15)

Regeneration: 8,267 Specks per Star per second
Max Capacity: 5 DUST per 1 NIGHT held
Low Threshold: 0.5 DUST (triggers alerts + auto-refill)

Formula: G_dust(t) = min(5 * V_NIGHT, R_g * V_Star * delta_t)
```

---

## License

MIT

