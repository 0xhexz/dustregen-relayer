# DustRegen Relayer

A sponsored gas relayer service for Midnight Network Testnet-02, enabling gas fee sponsorship for user transactions.

## Project Structure

```
dustregen-relayer/
├── pkgs/
│   ├── contract/          # Compact Smart Contract
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── DustRegenRelayer.compact
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── cli/              # TypeScript CLI & Express Relayer Service
│       ├── src/
│       │   ├── index.ts
│       │   ├── relayer/
│       │   ├── wallet/
│       │   ├── transaction/
│       │   └── config/
│       ├── package.json
│       └── tsconfig.json
├── package.json          # Monorepo root
├── tsconfig.json         # Root TypeScript config
├── agent.md             # Agent steering rules
├── claude.md            # Claude development guidelines
└── README.md
```

## Features

- **Gas Sponsorship**: Sponsor gas fees for user transactions on Midnight Network
- **Compact Smart Contract**: Secure contract for managing relayer state and sponsorship logic
- **TypeScript CLI**: Command-line interface for wallet and transaction management
- **Express API**: REST API for programmatic access to relayer services
- **Testnet-02 Ready**: Configured for Midnight Network Testnet-02

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Midnight Network Testnet-02 access

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd dustregen-relayer

# Install dependencies
npm install

# Build all packages
npm run build
```

## Usage

### CLI Commands

```bash
# Initialize configuration
npx dustregen config init

# Initialize wallet
npx dustregen wallet init

# Check wallet balance
npx dustregen wallet balance

# Sponsor a transaction
npx dustregen transaction sponsor \
  -u <user-address> \
  -a <gas-amount> \
  -s <user-signature>

# Start relayer service
npx dustregen start --port 3000
```

### API Endpoints

- `GET /health` - Health check
- `POST /api/v1/sponsor` - Sponsor a transaction
- `GET /api/v1/status` - Relayer status

### Example Sponsorship Request

```bash
curl -X POST http://localhost:3000/api/v1/sponsor \
  -H "Content-Type: application/json" \
  -d '{
    "user": "0x1234...",
    "gasAmount": "1000000",
    "userSignature": "0xabcd..."
  }'
```

## Development

### Building

```bash
# Build all packages
npm run build

# Build specific package
cd pkgs/contract && npm run build
cd pkgs/cli && npm run build
```

### Testing

```bash
# Run tests
npm test

# Run linting
npm run lint
```

### Contract Development

The Compact contract is located in `pkgs/contract/src/DustRegenRelayer.compact`. Key features:

- Private state management with `disclose()` for ledger writes
- Gas sponsorship logic with signature verification
- Owner-controlled fee management
- Modular composition pattern

## Configuration

Create a `.dustregen.config.json` file:

```json
{
  "network": "testnet-02",
  "relayer": {
    "port": 3000,
    "host": "localhost",
    "feePercentage": 0,
    "minSponsorshipAmount": "1000",
    "maxSponsorshipAmount": "1000000"
  },
  "wallet": {
    "mnemonic": "",
    "derivationPath": "m/44'/60'/0'/0/0"
  },
  "contract": {
    "address": "",
    "abi": "DustRegenRelayer"
  }
}
```

## Security Considerations

1. **Wallet Security**: Store mnemonic phrases securely using environment variables
2. **Signature Verification**: Always verify user signatures before sponsorship
3. **Rate Limiting**: Implement rate limiting on API endpoints
4. **Input Validation**: Validate all user inputs
5. **Private State**: Always use `disclose()` for private state before ledger writes

## Midnight Network Rules

- DUST is non-transferable
- Use `waitForWalletSync()` before transaction operations
- Use `balanceUnsealedTransaction()` for contract calls
- Use `balanceSealedTransaction()` for atomic swaps
- Target Compact language version >= 0.28.0

## License

MIT