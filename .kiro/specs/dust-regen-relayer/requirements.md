# Requirements Document

## Introduction

The DustRegen Relayer is a CLI-based production-grade Sponsored Gas Relayer for the Midnight Network (Preview). It enables users with zero DUST balance (unfunded wallets) to submit contract calls and token transfers by utilizing the DUST gas capacity of a Sponsor Wallet holding NIGHT tokens. The system implements the Midnight "battery model" where NIGHT tokens continuously generate DUST for transaction fees.

## Glossary

- **DustRegen_Relayer**: The complete system comprising the Sponsor Service, CLI interface, and supporting infrastructure that enables gasless transactions on Midnight Network.
- **User_Wallet**: A wallet initiating transactions with 0 DUST balance. Creates unbalanced transaction payloads without exposing private keys.
- **Sponsor_Wallet**: A persistent, pre-funded wallet holding NIGHT tokens that generates DUST capacity for sponsoring transactions.
- **Sponsor_Service**: The Express.js backend API that receives unbalanced transactions, injects DUST inputs, balances the DUST portion, and returns balanced transactions.
- **Unbalanced_Transaction**: A transaction payload with 0 DUST inputs/outputs, created by an unfunded user wallet.
- **Balanced_Transaction**: A transaction with DUST inputs added by the Sponsor Service, ready for user signing.
- **DUST**: The native fee token on Midnight Network (unit: Speck, 1 DUST = 10^15 Specks).
- **NIGHT**: The native staking token on Midnight Network (unit: Star, 1 NIGHT = 10^6 Stars).
- **DUST_Capacity**: Maximum DUST that can be generated per NIGHT (5 DUST per NIGHT).
- **DUST_Generation_Rate**: Rate at which DUST regenerates (8,267 Specks per Star per second).
- **Compact_Compiler**: The Midnight compiler for .compact smart contracts.
- **cNIGHT**: Collateralized NIGHT representation used in DUST generation.
- **UTXO_Collision**: A race condition where concurrent requests consume the same UTXOs.

## Requirements

### Requirement 1: Test Smart Contract Development

**User Story:** As a developer, I want a simple test contract, so that I can verify gasless transaction sponsorship works correctly.

#### Acceptance Criteria

1. THE Compact_Compiler SHALL compile the test-call.compact contract with pragma version >= 0.28.0
2. THE Test_Contract SHALL maintain a public ledger counter variable
3. WHEN the incrementCounter() circuit is invoked, THE Test_Contract SHALL increment the counter by one
4. THE Test_Contract SHALL expose the counter value through a public ledger query

### Requirement 2: Wallet Synchronization Guard

**User Story:** As a developer, I want robust wallet synchronization, so that transactions do not fail due to sync issues.

#### Acceptance Criteria

1. WHEN waitForWalletSync() is called, THE System SHALL poll wallet.state() using RxJS streams
2. WHILE polling, THE System SHALL wait until isSynced === true
3. IF the configurable timeout is exceeded, THE System SHALL throw a WalletSyncTimeoutError
4. WHEN the Sponsor_Wallet is synchronized, THE System SHALL verify DUST balance is active
5. THE System SHALL verify valid cNIGHT inputs exist via DustRegistration before transaction construction

### Requirement 3: Sponsor Wallet Initialization

**User Story:** As a system operator, I want secure sponsor wallet initialization, so that the relayer can sponsor transactions safely.

#### Acceptance Criteria

1. THE Sponsor_Service SHALL load the Sponsor_Wallet seed phrase from a .env file
2. THE Sponsor_Service SHALL initialize the Sponsor_Wallet using LevelDB for private state persistence
3. WHEN initialized, THE Sponsor_Wallet SHALL connect to the Midnight Preview network
4. THE Sponsor_Service SHALL log the Sponsor_Wallet's native address and DUST balance on startup

### Requirement 4: Sponsor Service API

**User Story:** As a user, I want to submit unbalanced transactions for sponsorship, so that I can execute transactions without DUST.

#### Acceptance Criteria

1. THE Sponsor_Service SHALL provide a POST /sponsor endpoint accepting Serialized_Unbalanced_Transaction as input
2. WHEN a request is received, THE Sponsor_Service SHALL parse the incoming transaction
3. THE Sponsor_Service SHALL check the Sponsor_Wallet's local DUST balance before processing
4. THE Sponsor_Service SHALL call balanceUnsealedTransaction(tx) with tokenKindsToBalance: ['dust']
5. THE Sponsor_Service SHALL route DUST change output back to the Sponsor_Wallet's public key
6. THE Sponsor_Service SHALL return the Balanced_Transaction to the requester
7. IF DUST balance is insufficient, THE Sponsor_Service SHALL return an InsufficientDUSTBalanceError

### Requirement 5: Transaction Queue Management

**User Story:** As a developer, I want sequential transaction processing, so that UTXO collisions are prevented.

#### Acceptance Criteria

1. WHEN multiple sponsorship requests are received concurrently, THE Sponsor_Service SHALL process transactions sequentially
2. THE Sponsor_Service SHALL implement a memory-lock queue for transaction balancing
3. WHILE a transaction is being balanced, THE System SHALL block subsequent requests
4. THE System SHALL release the lock after balancing completes or fails

### Requirement 6: DUST Regeneration Monitoring

**User Story:** As a system operator, I want DUST regeneration tracking, so that I can monitor sponsor wallet health.

#### Acceptance Criteria

1. THE System SHALL calculate and log DUST regeneration using the formula: rate = 8,267 Specks per Star per second
2. THE System SHALL calculate net DUST loss per transaction
3. WHEN Sponsor_Wallet DUST level falls below 0.5 DUST, THE System SHALL log a critical threshold warning
4. THE System SHALL display current DUST capacity percentage relative to maximum capacity

### Requirement 7: Transaction Fee Estimation

**User Story:** As a developer, I want accurate fee estimation, so that BalanceCheckOverspend errors are prevented.

#### Acceptance Criteria

1. THE System SHALL include additionalFeeOverhead (default 1,000n) in transaction fee estimation
2. THE System SHALL calculate total required DUST including overhead before balancing
3. IF estimated fee exceeds available DUST, THE System SHALL return an InsufficientFeeError

### Requirement 8: CLI Test Simulator

**User Story:** As a tester, I want an interactive CLI interface, so that I can validate the complete sponsorship flow.

#### Acceptance Criteria

1. THE CLI_Simulator SHALL generate a temporary User_Wallet with 0 NIGHT and 0 DUST
2. THE CLI_Simulator SHALL synchronize the User_Wallet state
3. THE CLI_Simulator SHALL construct a transaction calling incrementCounter() on the deployed test contract
4. THE CLI_Simulator SHALL serialize the Unbalanced_Transaction and POST to the Sponsor_Service /sponsor endpoint
5. THE CLI_Simulator SHALL receive the Balanced_Transaction and sign it with the User_Wallet private key
6. THE CLI_Simulator SHALL submit the finalized transaction to the Midnight Preview node
7. THE CLI_Simulator SHALL monitor block progression until transaction finalization
8. WHEN finalized, THE CLI_Simulator SHALL display the paid fees in DUST

### Requirement 9: Error Handling and Recovery

**User Story:** As a user, I want informative error messages, so that I can understand and resolve issues.

#### Acceptance Criteria

1. WHEN wallet synchronization fails, THE System SHALL return a descriptive WalletSyncError with timeout details
2. WHEN transaction parsing fails, THE System SHALL return a TransactionParseError with invalid payload details
3. WHEN transaction balancing fails, THE System SHALL return a BalanceError with reason code
4. WHEN network submission fails, THE System SHALL return a NetworkSubmissionError with node response
5. THE System SHALL preserve original error context in all error responses

### Requirement 10: Security and Key Management

**User Story:** As a system operator, I want secure key handling, so that sponsor funds remain protected.

#### Acceptance Criteria

1. THE Sponsor_Wallet seed phrase SHALL never be logged or exposed in API responses
2. THE User_Wallet private key SHALL never leave the local runtime environment
3. THE Sponsor_Service SHALL validate incoming transaction structure before processing
4. THE Sponsor_Service SHALL reject malformed or potentially malicious transaction payloads

### Requirement 11: Round-Trip Transaction Serialization

**User Story:** As a developer, I want reliable transaction serialization, so that transactions can be transmitted between components.

#### Acceptance Criteria

1. WHEN a transaction is serialized, THE System SHALL produce a valid string representation
2. WHEN a serialized transaction is deserialized, THE System SHALL reconstruct an equivalent transaction object
3. FOR ALL valid transactions, serialization then deserialization SHALL produce an equivalent object (round-trip property)
4. THE System SHALL use the standard Midnight SDK serialization format

### Requirement 12: Network Configuration

**User Story:** As a developer, I want configurable network settings, so that the system can target different Midnight networks.

#### Acceptance Criteria

1. THE System SHALL support configuration for Midnight Preview network
2. THE System SHALL allow configuration of indexer URL and node endpoint
3. THE System SHALL allow configuration of the deployed test contract address
4. WHERE network configuration is invalid, THE System SHALL return a ConfigurationError on startup
