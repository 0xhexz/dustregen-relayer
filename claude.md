# DustRegen Relayer - Claude Development Guidelines

## Project Structure
```
dustregen-relayer/
├── pkgs/
│   ├── contract/          # Compact Smart Contract
│   │   ├── src/
│   │   │   ├── index.ts   # Contract exports
│   │   │   └── DustRegenRelayer.compact  # Main contract
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── cli/              # TypeScript CLI & Express Relayer Service
│       ├── src/
│       │   ├── index.ts           # CLI entry point
│       │   ├── relayer/           # Express relayer service
│       │   ├── wallet/            # Wallet management
│       │   ├── transaction/       # Transaction building
│       │   └── config/            # Configuration
│       ├── package.json
│       └── tsconfig.json
├── package.json          # Monorepo root
├── tsconfig.json         # Root TypeScript config
├── agent.md             # Agent steering rules
└── claude.md            # Claude development guidelines
```

## Development Workflow

### 1. Contract Development
- Write Compact contracts targeting version >= 0.28.0
- Use `disclose()` for all private state before ledger writes
- Implement modular composition instead of inheritance
- Test with Compact compiler before integration

### 2. TypeScript SDK Integration
- Use `@midnight-ntwrk/dapp-connector-api` v4.0.0+
- Implement proper wallet sync with `waitForWalletSync()`
- Use correct transaction balancing methods:
  - `balanceUnsealedTransaction()` for contract calls
  - `balanceSealedTransaction()` for swaps

### 3. Relayer Service
- Build Express.js API with CORS support
- Implement rate limiting and input validation
- Add health check endpoints
- Use Winston for structured logging

### 4. CLI Development
- Use Commander.js for CLI interface
- Implement wallet management commands
- Add transaction submission commands
- Include configuration management

## Key Implementation Patterns

### Transaction Sponsorship Pattern
```typescript
// Example gas sponsorship flow
async function sponsorTransaction(userTx: Transaction) {
  // 1. Wait for wallet sync
  await waitForWalletSync();
  
  // 2. Validate transaction
  validateTransaction(userTx);
  
  // 3. Create sponsorship transaction
  const sponsorTx = createSponsorshipTx(userTx);
  
  // 4. Balance transaction
  const balancedTx = balanceUnsealedTransaction(sponsorTx);
  
  // 5. Sign and submit
  const signedTx = await signTransaction(balancedTx);
  return await submitTransaction(signedTx);
}
```

### Contract State Management
```compact
// Example Compact contract pattern
module DustRegenRelayer {
  // Private state
  struct RelayerState {
    balance: Uint64;
    sponsoredCount: Uint64;
  }
  
  // Public ledger
  ledger {
    totalSponsored: Uint64;
    relayerActive: Bool;
  }
  
  // Circuit with disclose()
  circuit sponsorTransaction(user: Bytes32, amount: Uint64) -> [] {
    let state = loadRelayerState();
    state.balance = state.balance - amount;
    state.sponsoredCount = state.sponsoredCount + 1;
    
    // Disclose private state before ledger write
    disclose(state);
    
    ledger.totalSponsored = ledger.totalSponsored + amount;
  }
}
```

## Testing Strategy
1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test contract-SDK integration
3. **API Tests**: Test Express endpoints
4. **E2E Tests**: Test complete sponsorship flow

## Deployment Checklist
- [ ] Configure environment variables
- [ ] Set up monitoring and alerts
- [ ] Implement backup strategy
- [ ] Test on Testnet-02
- [ ] Document API endpoints
- [ ] Set up rate limiting
- [ ] Implement security headers

## Common Pitfalls to Avoid
1. **Missing `disclose()`**: Always wrap private state in `disclose()` before ledger writes
2. **Wallet Sync**: Never skip `waitForWalletSync()` before transaction operations
3. **Transaction Balancing**: Use correct balancing method for transaction type
4. **DUST Handling**: Remember DUST is non-transferable
5. **Error Handling**: Implement comprehensive error handling with proper logging