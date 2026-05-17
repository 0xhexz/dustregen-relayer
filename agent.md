# DustRegen Relayer - Agent Steering Rules

## Project Overview
DustRegen Relayer is a sponsored gas relayer service for Midnight Network Testnet-02, enabling gas fee sponsorship for user transactions.

## Compilation Rules
1. **Compact Version**: Target Compact language version >= 0.28.0 (ESM compatible)
2. **Private State Disclosure**: All private state must be wrapped in `disclose()` before writing to public ledger variables
3. **No Inheritance**: Use Modular Composition with prefix mapping instead of Solidity-style inheritance
4. **No Recursion**: Avoid recursion or dynamic array bounds in Compact contracts

## Transaction Rules
1. **DUST Handling**: DUST is non-transferable; use `@midnight-ntwrk/dapp-connector-api` v4.0.0+ balancing rules for gas sponsorship
2. **Wallet Sync**: Always use `waitForWalletSync()` before constructing or balancing any transactions
3. **Transaction Balancing**:
   - Use `balanceUnsealedTransaction(tx)` for contract-interacting transactions
   - Use `balanceSealedTransaction(tx)` for atomic swaps
4. **Gas Sponsorship**: Implement strict gas limit validation and fee calculation

## Security Rules
1. **Input Validation**: Validate all user inputs before processing
2. **Rate Limiting**: Implement rate limiting for relayer endpoints
3. **Nonce Management**: Ensure proper nonce handling to prevent replay attacks
4. **Signature Verification**: Verify all transaction signatures before relaying

## Development Rules
1. **TypeScript Strict Mode**: Enable all strict TypeScript compiler options
2. **Error Handling**: Implement comprehensive error handling with proper logging
3. **Testing**: Write unit tests for all critical paths
4. **Documentation**: Maintain up-to-date API documentation

## Deployment Rules
1. **Testnet-02**: Target Midnight Network Testnet-02 for initial deployment
2. **Environment Variables**: Use environment variables for sensitive configuration
3. **Monitoring**: Implement health checks and monitoring endpoints
4. **Backup**: Maintain backup strategies for relayer state