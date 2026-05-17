# Implementation Plan: DustRegen Relayer

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that
will implement each step with incremental progress. Each task builds on the
previous tasks and ends with the components wired together. There is no hanging
or orphaned code that is not integrated into a previous step. Tasks focus only
on writing, modifying, or testing code.

The relayer is implemented in **TypeScript** against the Midnight SDK v4.x
(`@midnight-ntwrk/wallet`, `@midnight-ntwrk/dapp-connector-api`,
`@midnight-ntwrk/ledger-v8`). The Compact contract targets `compactc 0.31.0`
(language `0.23.0`, runtime `0.16.0`) and is **already compiled** to
`pkgs/contract/src/managed/test-call/`. Tasks below pick up at the property
test for the contract and proceed through the relayer service, simulator, test
suite, and operational artifacts.

Constants such as `STARS_PER_NIGHT = 10^6`, `SPECKS_PER_DUST = 10^15`,
`REGEN_SPECKS_PER_STAR_PER_SEC = 8267n`, and `additionalFeeOverhead = 1_000n`
live in a single module (`monitor/dust.ts`) and are imported everywhere they
are needed.

## Tasks

- [ ] 1. Test Smart Contract (Phase 1)

  - [x] 1.1 Author and compile `test-call.compact`
    - File: `pkgs/contract/src/test-call.compact` (already authored)
    - Output: `pkgs/contract/src/managed/test-call/` (already produced by `compactc 0.31.0`)
    - Pragma `language_version >= 0.16`, exports `counter: Counter` and circuit `incrementCounter()`
    - Toolchain pinned to `compactc 0.31.0` (language `0.23.0`, runtime `0.16.0`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [-] 1.2 Write property test for counter increment
    - File: `pkgs/contract/src/__tests__/increment.spec.ts`
    - **Property 1: Counter increment is +1 for any prior state**
    - **Validates: Requirements 1.3**
    - Use `fast-check` with `numRuns: 100`, instantiate the contract via
      `pkgs/contract/src/managed/test-call/contract/index` and the
      `@midnight-ntwrk/compact-runtime` test harness
    - Tag file with `// Feature: dust-regen-relayer, Property 1: Counter increment is +1 for any prior state`

- [ ] 2. Configuration, Errors, and Wallet Foundations (Phase 2)

  - [ ] 2.1 Implement `NetworkConfig` loader and validation
    - File: `pkgs/cli/src/config/network.ts`
    - Define `NetworkConfig` interface (networkId, nodeRpcUrl, indexerUrl,
      indexerWsUrl, proofServerUrl, contractAddress, sponsorSeed,
      privateStateDir, walletSyncTimeoutMs, relayerPort, additionalFeeOverhead)
    - Export `loadNetworkConfig(env = process.env): NetworkConfig`
    - Reject when `networkId !== 'Preview'`, when any URL fails `new URL()`,
      when `SPONSOR_SEED` is missing, or when `contractAddress` does not match
      the Midnight contract address shape; throw `ConfigurationError`
    - Apply defaults: `walletSyncTimeoutMs = 120_000`, `relayerPort = 3000`,
      `additionalFeeOverhead = 1_000n`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 2.2 Write property test for configuration validation
    - File: `pkgs/cli/src/__tests__/config.spec.ts`
    - **Property 12: Configuration validation accepts only well-formed inputs**
    - **Validates: Requirements 12.2, 12.3, 12.4**
    - `numRuns: 100`, generate URL/contract-address tuples and assert
      acceptance iff each URL parses with `new URL()` and the contract address
      matches the documented shape; otherwise expect `ConfigurationError`

  - [ ] 2.3 Implement `RelayerError` class hierarchy and `ErrorCode` enum
    - File: `pkgs/cli/src/errors.ts`
    - Define abstract base `RelayerError` (with `code`, `httpStatus`, `details`)
    - Subclasses: `WalletSyncTimeoutError` (503), `InsufficientDUSTBalanceError`
      (402), `InsufficientFeeError` (402), `TransactionParseError` (400),
      `BalanceError` (502), `NetworkSubmissionError` (502), `ConfigurationError`
      (boot-time, no HTTP)
    - Export `ErrorCode` union covering every subclass `code`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1_

  - [ ] 2.4 Implement `waitForWalletSync` utility
    - File: `pkgs/cli/src/wallet/sponsor.ts` (initial creation)
    - Use RxJS `firstValueFrom(wallet.state().pipe(filter(s => s.syncProgress?.synced === true), timeout({ each: timeoutMs, with: () => throwError(() => new WalletSyncTimeoutError(timeoutMs)) })))`
    - Export `waitForWalletSync(wallet, timeoutMs): Promise<WalletState>`
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 2.5 Write property test for wallet sync resolve/timeout
    - File: `pkgs/cli/src/__tests__/wallet/sync.spec.ts` (initial creation)
    - **Property 2: Wallet sync resolves on first synced emission, else times out**
    - **Validates: Requirements 2.1, 2.2, 2.3, 8.2**
    - `numRuns: 100`, drive a `Subject<WalletState>` with `n ≥ 0` non-synced
      events optionally followed by a synced event, assert resolution iff
      synced emitted within timeout, else `WalletSyncTimeoutError`

  - [ ] 2.6 Implement `verifyDustRegistration`
    - File: `pkgs/cli/src/wallet/sponsor.ts` (extend, do not duplicate 2.4)
    - Walk the synced `WalletState`, succeed iff at least one live
      `DustRegistration` references a cNIGHT input and DUST balance is strictly
      positive, otherwise throw `InsufficientDUSTBalanceError` with the
      current NIGHT/DUST snapshot in `details`
    - _Requirements: 2.4, 2.5_

  - [ ]* 2.7 Write property test for DUST registration verification
    - File: `pkgs/cli/src/__tests__/wallet/sync.spec.ts` (extend)
    - **Property 3: DUST registration is verified iff a live cNIGHT input exists**
    - **Validates: Requirements 2.4, 2.5**
    - `numRuns: 100`, generate synthetic wallet states with arbitrary
      registrations and DUST balances, assert success iff at least one live
      `DustRegistration` is present and DUST > 0

  - [ ] 2.8 Implement ephemeral user wallet builder
    - File: `pkgs/cli/src/wallet/user.ts`
    - Export `buildEphemeralUserWallet(cfg): Promise<EphemeralUserWallet>`
    - Generate fresh entropy, use an in-memory private-state provider, do not
      reuse the sponsor LevelDB directory, call `waitForWalletSync` so that
      the indexer view is populated for transaction construction
    - _Requirements: 8.1_

  - [ ]* 2.9 Write property test for ephemeral user wallet zero balances
    - File: `pkgs/cli/src/__tests__/wallet/sync.spec.ts` (extend)
    - **Property 11: Ephemeral user wallets have zero balances at construction**
    - **Validates: Requirements 8.1**
    - `numRuns: 100`, build with mocked sync, assert
      `nightStars === 0n && dustSpecks === 0n` immediately after
      `waitForWalletSync` resolves

  - [ ] 2.10 Implement persistent sponsor wallet builder
    - File: `pkgs/cli/src/wallet/sponsor.ts` (extend, share `waitForWalletSync`
      and `verifyDustRegistration` from 2.4 and 2.6)
    - Wire `@midnight-ntwrk/level-private-state-provider` against
      `cfg.privateStateDir`, restore wallet from `cfg.sponsorSeed`, start the
      internal sync loop, log native address and DUST balance on startup
      (seed redacted), expose `close()`
    - Export `buildSponsorWallet(cfg): Promise<SponsorWallet>` returning
      `{ wallet, publicKey, nativeAddress, close }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3. Phase 2 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Relayer Service (Phase 3)

  - [ ] 4.1 Implement transaction codec
    - File: `pkgs/cli/src/transaction/codec.ts`
    - Export `serializeUnbalanced`, `deserializeUnbalanced`,
      `serializeBalanced`, `deserializeBalanced` over the
      `@midnight-ntwrk/ledger-v8` serialization format
    - Wire format: lowercase hex; `deserialize*` throws `TransactionParseError`
      on non-hex input, hex that fails to deserialize, or structurally invalid
      transactions
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 4.2, 4.6, 10.3, 10.4_

  - [ ]* 4.2 Write property test for transaction round-trip and parse rejection
    - File: `pkgs/cli/src/__tests__/transaction/codec.spec.ts`
    - **Property 4: Transaction serialization round-trip and parse rejection**
    - **Validates: Requirements 4.2, 4.6, 8.4, 9.2, 10.3, 10.4, 11.1, 11.2, 11.3**
    - `numRuns: 1000` (CI bump), assert `deserialize(serialize(tx)) ≅ tx` for
      generated valid transactions and `TransactionParseError` for arbitrary
      non-hex / malformed hex inputs

  - [ ] 4.3 Implement transaction signing utility
    - File: `pkgs/cli/src/transaction/sign.ts`
    - Export `signBalancedTx(wallet, balancedTxHex): Promise<string>`
      returning the hex of a fully signed, submittable tx
    - Performed only by the user wallet on the simulator side; never invoked
      from the relayer process
    - _Requirements: 8.5, 10.2_

  - [ ] 4.4 Implement battery-model constants and `DustMonitor`
    - File: `pkgs/cli/src/monitor/dust.ts`
    - Export constants: `STARS_PER_NIGHT = 1_000_000n`,
      `SPECKS_PER_DUST = 1_000_000_000_000_000n`,
      `REGEN_SPECKS_PER_STAR_PER_SEC = 8_267n`,
      `DUST_CAP_PER_NIGHT_IN_SPECKS = 5n * SPECKS_PER_DUST`,
      `LOW_DUST_THRESHOLD_SPECKS = SPECKS_PER_DUST / 2n`
    - Export `DustSnapshot` type and `DustMonitor` class with
      `start(intervalMs)`, `stop()`, `current()` over an RxJS interval
      subscribed to `wallet.state()`
    - Log `level: 'warn'` `LowDustBalance` event when `dustSpecks < LOW_DUST_THRESHOLD_SPECKS`
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ]* 4.5 Write property test for battery-model math
    - File: `pkgs/cli/src/__tests__/monitor/dust.spec.ts`
    - **Property 9: Battery-model math is closed-form correct**
    - **Validates: Requirements 6.1, 6.3, 6.4**
    - `numRuns: 1000` (CI bump), generate `(currentDustSpecks, nightStars,
      elapsedSeconds)` triples; assert `projectedDust ===
      min(current + 8267 * nightStars * elapsed, 5 * nightStars * 10^15 / 10^6)`,
      `capacityPct ∈ [0, 1]`, and `isLowDust ⇔ current < SPECKS_PER_DUST / 2`

  - [ ] 4.6 Implement `SponsorMutex`
    - File: `pkgs/cli/src/queue/mutex.ts`
    - Wrap `async-mutex` `Mutex`, expose `runExclusive(label, fn)` with
      `try/finally` release, log `acquire`/`release` pairs with `label` and
      wait time, and expose a `pending` getter for `/health` visibility
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 4.7 Write property test for sponsor mutex FIFO/exclusive/live
    - File: `pkgs/cli/src/__tests__/queue/mutex.spec.ts`
    - **Property 7: Sponsorship queue is FIFO, mutually exclusive, and live**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - `numRuns: 1000` (CI bump), submit `N` concurrent requests with mixed
      success/failure mocks; assert balancing-call execution order equals
      submission order, in-flight count never exceeds 1, and `pending` is 0
      after all settle

  - [ ] 4.8 Implement Express error middleware and redacting logger
    - Files: `pkgs/cli/src/relayer/middleware.ts`, `pkgs/cli/src/logger.ts`
    - Logger redacts fields matching `/seed|mnemonic|private/i`,
      `Authorization`, and the runtime value of `cfg.sponsorSeed`
    - Middleware maps `RelayerError` instances to their `httpStatus` with
      `{ ok: false, error: { code, message, details } }`; unknown errors map
      to 500 with `code: 'BalanceError'` and `message: 'internal error'`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1_

  - [ ]* 4.9 Write property test for error context and seed redaction
    - File: `pkgs/cli/src/__tests__/relayer/sponsor.spec.ts` (initial creation)
    - **Property 10: Error context preserved and sponsor seed never leaks**
    - **Validates: Requirements 9.5, 10.1**
    - `numRuns: 100`, throw arbitrary `RelayerError` subclasses through the
      middleware and assert `error.code === e.code` and message/details
      contains `e.message`; embed `SPONSOR_SEED` in nested arrays and objects
      passed through the logger and assert serialized output never contains the seed

  - [ ] 4.10 Implement `POST /sponsor` route handler
    - File: `pkgs/cli/src/relayer/routes/sponsor.ts`
    - Define `SponsorRequest` (zod-validated `{ unbalancedTx: hex }`) and
      `SponsorResponse` discriminated union
    - Flow: validate body → `deserializeUnbalanced` (`TransactionParseError`)
      → `waitForWalletSync` (`WalletSyncTimeoutError`) → `mutex.runExclusive`:
      assert DUST sufficiency (`InsufficientDUSTBalanceError` /
      `InsufficientFeeError` using `additionalFeeOverhead`), call
      `wallet.balanceUnsealedTransaction(tx, { tokenKindsToBalance: ['dust'],
      changeOutputDestination: sponsor.publicKey, additionalFeeOverhead })`
      (wrap thrown errors as `BalanceError`), respond `{ ok: true, balancedTx,
      estimatedFee: bigint.toString() }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.1, 7.2, 7.3_

  - [ ]* 4.11 Write property test for DUST sufficiency gate
    - File: `pkgs/cli/src/__tests__/relayer/sponsor.spec.ts` (extend)
    - **Property 5: DUST sufficiency gate is exact**
    - **Validates: Requirements 4.3, 4.7, 7.1, 7.2, 7.3**
    - `numRuns: 100`, generate `(d, f)` pairs and a deterministic mock for
      `balanceUnsealedTransaction`; assert proceed iff
      `d ≥ f + additionalFeeOverhead`; emit `InsufficientDUSTBalanceError`
      when `d < additionalFeeOverhead`, otherwise `InsufficientFeeError`

  - [ ]* 4.12 Write property test for DUST change routing to sponsor
    - File: `pkgs/cli/src/__tests__/relayer/sponsor.spec.ts` (extend)
    - **Property 6: DUST change is always routed to the sponsor**
    - **Validates: Requirements 4.5**
    - `numRuns: 100`, exercise `/sponsor` against a mocked balancing call that
      records change destinations; assert every DUST change output's
      destination public key equals `sponsor.publicKey`

  - [ ]* 4.13 Write property test for DUST conservation
    - File: `pkgs/cli/src/__tests__/relayer/sponsor.spec.ts` (extend)
    - **Property 8: DUST conservation across a successful sponsorship**
    - **Validates: Requirements 6.2**
    - `numRuns: 100`, snapshot sponsor DUST before/after a successful
      `/sponsor`; assert `after === before - F + regenAccrued(elapsed)` using
      the same battery constants as 4.4

  - [ ] 4.14 Wire Express server with routes, middleware, and DUST monitor
    - File: `pkgs/cli/src/relayer/server.ts`
    - Build app factory `createRelayerApp(cfg, sponsor, mutex, monitor)` that
      mounts `cors`, JSON body parser, `POST /sponsor`, optional `/health`
      reporting `mutex.pending` and the latest `DustSnapshot`, and the error
      middleware from 4.8 last
    - _Requirements: 4.1_

- [ ] 5. Phase 3 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. CLI Simulator (Phase 4)

  - [ ] 6.1 Implement 6-step end-to-end simulator flow
    - File: `pkgs/cli/src/simulator/flow.ts`
    - Steps: (1) `buildEphemeralUserWallet(cfg)`, (2) `waitForWalletSync(user.wallet, cfg.walletSyncTimeoutMs)`,
      (3) construct `incrementCounter()` call against the deployed test
      contract using bindings from `pkgs/contract/src/managed/test-call/contract`,
      producing an `UnbalancedTransaction`, (4) `serializeUnbalanced` and
      `POST /sponsor` (use `node:fetch` or `axios`), (5)
      `signBalancedTx(user.wallet, response.balancedTx)`, (6) submit signed tx
      to the Preview node
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 6.2 Implement finalization polling and DUST fee print
    - File: `pkgs/cli/src/simulator/flow.ts` (extend 6.1)
    - Poll the Preview node for the submitted txId until finalization (with
      configurable interval and timeout), retrieve the receipt, and print
      `feePaid` in DUST as Specks divided by `SPECKS_PER_DUST` with full
      precision (use the constant from 4.4)
    - _Requirements: 8.7, 8.8, 6.2_

  - [ ] 6.3 Implement entry point with `commander` (`relayer | simulate` subcommands)
    - File: `pkgs/cli/src/index.ts`
    - `relayer` subcommand: `loadNetworkConfig` → `buildSponsorWallet` →
      construct `SponsorMutex` → start `DustMonitor` → start
      `createRelayerApp` listening on `cfg.relayerPort`
    - `simulate` subcommand: `loadNetworkConfig` → `runSimulatorFlow(cfg)`;
      exit non-zero on any thrown `RelayerError`
    - _Requirements: 4.1, 8.1, 8.6, 12.1_

  - [ ]* 6.4 Write component tests for the simulator flow
    - File: `pkgs/cli/src/__tests__/simulator/flow.spec.ts`
    - Use `supertest` against a mocked `createRelayerApp` (mocked sponsor
      wallet, no LevelDB, no proof server) to assert end-to-end orchestration:
      build → POST → sign → submit → receipt
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [ ] 7. Phase 4 Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Test Suite Integration (Phase 5)

  - [ ] 8.1 Set up the test infrastructure
    - Files: `pkgs/cli/jest.config.ts`, `pkgs/cli/tsconfig.test.json`,
      `pkgs/contract/jest.config.ts`
    - Install `fast-check@^3` and ensure `jest`, `ts-jest` resolve in both
      workspaces; add `numRuns` defaults (100 standard, 1000 for CI-tagged
      property files); register a top-of-file tag convention
      `// Feature: dust-regen-relayer, Property N: <title>`
    - Wire `npm test` and `npm test --workspaces` to run all property and unit
      specs across the monorepo

  - [ ]* 8.2 Implement Preview integration test gated by env flag
    - File: `pkgs/cli/src/__tests__/e2e/preview.int.spec.ts`
    - Skip when `RUN_PREVIEW_E2E !== '1'`; otherwise execute the full
      simulator flow against the live Preview node, indexer, and proof server,
      assert finalization and that the receipt's DUST fee is non-zero and not
      greater than `expectedFee + additionalFeeOverhead`
    - _Requirements: 1.1, 4.1, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [ ] 9. Documentation and Operational Artifacts (Phase 6)

  - [ ] 9.1 Author `.env.example`
    - File: `.env.example` (workspace root)
    - Variables: `NETWORK_ID=Preview`, `NODE_RPC_URL`, `INDEXER_URL`,
      `INDEXER_WS_URL`, `PROOF_SERVER_URL`, `CONTRACT_ADDRESS`,
      `SPONSOR_SEED` (placeholder, never a real seed),
      `PRIVATE_STATE_DIR=./.sponsor-state`, `WALLET_SYNC_TIMEOUT_MS=120000`,
      `RELAYER_PORT=3000`, `ADDITIONAL_FEE_OVERHEAD=1000`,
      `RUN_PREVIEW_E2E=0`
    - _Requirements: 3.1, 12.1, 12.2, 12.3_

  - [ ] 9.2 Update `README.md` with setup, run, and simulate instructions
    - File: `README.md`
    - Sections: Prerequisites (Node ≥ 18, `compactc 0.31.0`), Install,
      Configure (.env), Build, Run relayer (`npm run dev relayer`), Run
      simulator (`npm run dev simulate`), Test (`npm test`,
      `RUN_PREVIEW_E2E=1 npm test -w pkgs/cli`), Architecture diagram link

  - [ ] 9.3 Author Preview deploy notes
    - File: `docs/deploy-preview.md`
    - Cover: minting cNIGHT for the sponsor on Preview, deploying
      `test-call.compact` and recording `CONTRACT_ADDRESS`, sizing the sponsor
      DUST capacity (5 DUST per NIGHT), restart procedure preserving the
      LevelDB private state at `./.sponsor-state`, and a low-DUST runbook

- [ ] 10. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
  Implementation tasks are never marked optional.
- Each task references specific requirements for traceability and, where
  applicable, the design property number it implements or validates.
- All twelve correctness properties from the design's *Correctness Properties*
  section appear as their own optional sub-tasks: 1.2 (P1), 2.2 (P12), 2.5 (P2),
  2.7 (P3), 2.9 (P11), 4.2 (P4), 4.5 (P9), 4.7 (P7), 4.9 (P10), 4.11 (P5),
  4.12 (P6), 4.13 (P8).
- Property tests use `fast-check` with `numRuns ≥ 100`; P4, P7, and P9 are
  bumped to `numRuns: 1000` per the design's testing strategy.
- Checkpoint tasks (3, 5, 7, 10) are intentionally lightweight gates between
  phases.
- Phase 1 sub-task 1.1 is already complete; the contract bindings live at
  `pkgs/contract/src/managed/test-call/`. Sub-task 1.2 (the P1 property test)
  remains pending because it depends on the Jest + fast-check harness from
  task 8.1.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.3", "8.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.1", "4.4", "4.6"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.8", "4.2", "4.3", "4.5", "4.7", "4.8", "9.1"] },
    { "id": 3, "tasks": ["2.5", "2.6", "4.9", "6.1"] },
    { "id": 4, "tasks": ["2.9", "2.10", "6.2"] },
    { "id": 5, "tasks": ["2.7", "4.10", "6.4"] },
    { "id": 6, "tasks": ["4.11", "4.14"] },
    { "id": 7, "tasks": ["4.12", "6.3"] },
    { "id": 8, "tasks": ["4.13", "8.2", "9.2", "9.3"] }
  ]
}
```
