// Feature: dust-regen-relayer, Property 1: Counter increment is +1 for any prior state
//
// Validates: Requirements 1.3
//
// Property 1 (from design.md):
//   For any starting counter value c0, after invoking incrementCounter() on
//   the test contract the resulting counter equals c0 + 1.
//
// Implementation strategy:
//   1. Instantiate the generated `Contract` from the compiled test-call
//      bindings (pkgs/contract/src/managed/test-call/contract/index).
//   2. Drive the prior state by applying `n` increments (where n is generated
//      by fast-check in [0, 64]).
//   3. Snapshot the resulting counter value c0.
//   4. Apply one more `incrementCounter()` and read c1.
//   5. Assert c1 === c0 + 1n.

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import * as runtime from '@midnight-ntwrk/compact-runtime';

import {
  Contract,
  ledger,
  type Witnesses,
} from '../managed/test-call/contract/index.js';

// The test-call contract has no witnesses or private state; an empty object
// is the appropriate value for both `Witnesses<PS>` and the private state PS.
type PrivateState = Record<string, never>;

const EMPTY_PRIVATE_STATE: PrivateState = {} as PrivateState;
const EMPTY_WITNESSES: Witnesses<PrivateState> = {};

/**
 * Build a fresh CircuitContext seeded from `Contract.initialState`, suitable
 * for chained `incrementCounter` calls.
 */
function freshCircuitContext(): runtime.CircuitContext<PrivateState> {
  const contract = new Contract<PrivateState>(EMPTY_WITNESSES);
  const ctorContext = runtime.constructorContext<PrivateState>(
    EMPTY_PRIVATE_STATE,
    // 32-byte hex coin public key — value is irrelevant for this contract,
    // which has no witnesses or coin operations.
    '0'.repeat(64),
  );
  const initial = contract.initialState(ctorContext);

  return runtime.createCircuitContext<PrivateState>(
    runtime.dummyContractAddress(),
    ctorContext.initialZswapLocalState,
    initial.currentContractState.data,
    initial.currentPrivateState,
  );
}

/**
 * Apply `incrementCounter()` once, returning the new CircuitContext.
 */
function applyIncrement(
  context: runtime.CircuitContext<PrivateState>,
): runtime.CircuitContext<PrivateState> {
  const contract = new Contract<PrivateState>(EMPTY_WITNESSES);
  const { context: nextContext } = contract.circuits.incrementCounter(context);
  return nextContext;
}

/**
 * Read the public ledger counter from a CircuitContext.
 *
 * The ledger() helper accepts either a ChargedState or a StateValue. The
 * CircuitContext exposes the live ChargedState as
 * `currentQueryContext.state`.
 */
function readCounter(context: runtime.CircuitContext<PrivateState>): bigint {
  // QueryContext.state is a ChargedState (see managed/test-call/contract/index.js,
  // where the constructor reads `context.currentQueryContext.state.state` to
  // obtain the underlying StateValue). `ledger()` accepts a ChargedState.
  const chargedState = (context.currentQueryContext as unknown as {
    state: Parameters<typeof ledger>[0];
  }).state;
  return ledger(chargedState).counter;
}

describe('test-call contract: Property 1 — incrementCounter is +1 for any prior state', () => {
  it('every prior state c0 satisfies counter(c0) + 1 === counter(after increment)', () => {
    fc.assert(
      fc.property(
        // Number of increments used to drive the prior state. Range chosen to
        // cover both the c0 = 0 boundary and meaningfully advanced states
        // without bloating each iteration's runtime.
        fc.integer({ min: 0, max: 64 }),
        (priorIncrements) => {
          let context = freshCircuitContext();
          for (let i = 0; i < priorIncrements; i += 1) {
            context = applyIncrement(context);
          }

          const c0 = readCounter(context);
          const afterContext = applyIncrement(context);
          const c1 = readCounter(afterContext);

          expect(c1).toBe(c0 + 1n);
          // Sanity: an additional increment also satisfies the property,
          // confirming the +1 invariant chains.
          expect(c0).toBe(BigInt(priorIncrements));
        },
      ),
      { numRuns: 100 },
    );
  });
});
