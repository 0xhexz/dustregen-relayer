/**
 * Mock implementation of @midnight-ntwrk/compact-runtime
 *
 * Provides enough functionality to run the compiled test-call contract
 * (counter increment) in unit tests without the actual Midnight SDK.
 *
 * The state model: the ledger is a key-value tree. Keys are encoded cell values
 * (typically small integers). Values are cell StateValues containing data.
 */

export function checkRuntimeVersion(_version) {
  // no-op in mock
}

export class CompactTypeUnsignedInteger {
  constructor(maxValue, byteWidth) {
    this._maxValue = maxValue;
    this._byteWidth = byteWidth;
  }

  alignment() {
    return { bits: this._byteWidth * 8, bytes: this._byteWidth };
  }

  toValue(n) {
    return { value: n, alignment: this.alignment() };
  }

  fromValue(cell) {
    // cell is { value: bigint, alignment: ... }
    if (cell != null && typeof cell === 'object' && 'value' in cell) {
      return cell.value;
    }
    return cell;
  }
}

export const CompactTypeBoolean = {
  alignment() {
    return { bits: 1, bytes: 1 };
  },
  toValue(b) {
    return { value: b, alignment: this.alignment() };
  },
  fromValue(cell) {
    if (cell != null && typeof cell === 'object' && 'value' in cell) {
      return cell.value;
    }
    return cell;
  },
};

export class CompactTypeBytes {
  constructor(length) {
    this._length = length;
  }

  alignment() {
    return { bits: this._length * 8, bytes: this._length };
  }

  toValue(b) {
    return { value: b, alignment: this.alignment() };
  }

  fromValue(cell) {
    if (cell != null && typeof cell === 'object' && 'value' in cell) {
      return cell.value;
    }
    return cell;
  }
}

export class CompactError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CompactError';
  }
}

export class ContractOperation {
  constructor() {
    this.name = '';
  }
}

/**
 * StateValue: represents ledger data nodes.
 *
 * For the mock, the root state is always an 'array' StateValue.
 * We use _data as a Map (string key -> StateValue cell) to model the
 * key-value tree structure that the real runtime uses.
 */
export class StateValue {
  constructor(type, data) {
    this._type = type;
    this._data = data;
  }

  static newArray() {
    return new StateValue('array', new Map());
  }

  static newNull() {
    return new StateValue('null', null);
  }

  static newCell(cellData) {
    // cellData = { value: { value: bigint, alignment }, alignment }
    return new StateValue('cell', cellData);
  }

  arrayPush(_item) {
    // In our mock, arrayPush on the initial state is a no-op placeholder.
    // The real structure is managed by queryLedgerState operations.
    return this;
  }

  encode() {
    return this;
  }

  get type() {
    return this._type;
  }

  get data() {
    return this._data;
  }
}

/**
 * ChargedState wraps a StateValue, tracking read costs.
 */
export class ChargedState {
  constructor(stateValue) {
    if (stateValue instanceof ChargedState) {
      this.state = stateValue.state;
    } else {
      this.state = stateValue;
    }
  }
}

/**
 * ContractState holds data (ChargedState) and operations map.
 */
export class ContractState {
  constructor() {
    this.data = new ChargedState(StateValue.newArray());
    this._operations = {};
  }

  setOperation(name, op) {
    this._operations[name] = op;
  }
}

/**
 * QueryContext: provides ledger query context for circuit execution.
 */
export class QueryContext {
  constructor(chargedState, _contractAddress) {
    this.state = chargedState instanceof ChargedState ? chargedState : new ChargedState(chargedState);
    this._contractAddress = _contractAddress;
  }
}

export const CostModel = {
  initialCostModel() {
    return {};
  },
};

export function dummyContractAddress() {
  return '0'.repeat(64);
}

export function emptyRunningCost() {
  return { total: 0n };
}

export function valueToBigInt(cell) {
  if (cell != null && typeof cell === 'object' && 'value' in cell) {
    const v = cell.value;
    if (typeof v === 'bigint') {
      return v;
    }
    if (v != null && typeof v === 'object' && 'value' in v) {
      return BigInt(v.value);
    }
    return BigInt(v);
  }
  return BigInt(cell);
}

/**
 * constructorContext: creates the context needed by Contract.initialState()
 */
export function constructorContext(privateState, coinPublicKey) {
  return {
    initialPrivateState: privateState,
    initialZswapLocalState: {
      coinPublicKey: coinPublicKey,
    },
  };
}

/**
 * createCircuitContext: produces a CircuitContext for circuit invocations.
 */
export function createCircuitContext(contractAddress, zswapLocalState, chargedState, privateState) {
  const cs = chargedState instanceof ChargedState ? chargedState : new ChargedState(chargedState);
  return {
    contractAddress,
    currentZswapLocalState: zswapLocalState,
    currentQueryContext: new QueryContext(cs, contractAddress),
    currentPrivateState: privateState,
  };
}

/**
 * Extract a string key from a cell value for map indexing.
 */
function cellToKey(cellStateValue) {
  if (cellStateValue instanceof StateValue && cellStateValue._type === 'cell') {
    const inner = cellStateValue._data;
    if (inner && typeof inner === 'object' && 'value' in inner) {
      const v = inner.value;
      if (typeof v === 'bigint') return String(v);
      if (v != null && typeof v === 'object' && 'value' in v) return String(v.value);
      return String(v);
    }
  }
  // Fallback
  return '0';
}

/**
 * Extract the bigint value stored in a cell.
 */
function extractCellBigInt(cellStateValue) {
  if (cellStateValue instanceof StateValue && cellStateValue._type === 'cell') {
    const inner = cellStateValue._data;
    if (inner && typeof inner === 'object' && 'value' in inner) {
      const v = inner.value;
      if (typeof v === 'bigint') return v;
      if (v != null && typeof v === 'object' && 'value' in v) return BigInt(v.value);
      return BigInt(v);
    }
  }
  return 0n;
}

/**
 * Extract alignment from a cell.
 */
function extractCellAlignment(cellStateValue) {
  if (cellStateValue instanceof StateValue && cellStateValue._type === 'cell' && cellStateValue._data) {
    return cellStateValue._data.alignment || { bits: 64, bytes: 8 };
  }
  return { bits: 64, bytes: 8 };
}

/**
 * queryLedgerState: The core VM for the mock.
 *
 * State model: The state is a Map<string, StateValue> where keys are
 * derived from path values and values are cell StateValues.
 *
 * Operations:
 * - push: push onto operand stack. storage=false means it's a path/key.
 * - ins: pop n storage items + preceding path items, insert into state map.
 *   If cached=true, uses the previously saved path (from idx with pushPath).
 * - idx: look up a value by path key. If pushPath=true, save the key for later ins.
 * - addi: add an immediate integer to the cell on top of the stack.
 * - dup: push a copy of the state map (for read-only queries).
 * - popeq: pop top and return it.
 */
export function queryLedgerState(context, _partialProofData, operations) {
  const qc = context.currentQueryContext;
  let stateValue = qc.state instanceof ChargedState ? qc.state.state : qc.state;

  if (!(stateValue instanceof StateValue)) {
    stateValue = StateValue.newArray();
  }

  // Get the state map
  let stateMap = stateValue._data instanceof Map ? stateValue._data : new Map();

  const stack = []; // operand stack: { storage: bool, value: StateValue }
  let savedKey = null; // saved key from idx with pushPath=true

  for (const op of operations) {
    if ('push' in op) {
      stack.push({ storage: op.push.storage, value: op.push.value });
    } else if ('ins' in op) {
      const { cached, n } = op.ins;

      // Pop n items from the stack (these are the values to insert)
      const values = [];
      for (let i = 0; i < n; i++) {
        values.unshift(stack.pop());
      }

      if (cached && savedKey !== null) {
        // Replace the value at the saved key
        if (values.length > 0) {
          stateMap.set(savedKey, values[0].value);
        }
        savedKey = null;
      } else {
        // Pop path keys (non-storage items remaining on stack)
        // For the counter init: stack has [{storage:false, key_cell}] after popping the storage item
        // The key determines where to store the value
        let key = '0';
        if (stack.length > 0 && !stack[stack.length - 1].storage) {
          const keyItem = stack.pop();
          key = cellToKey(keyItem.value);
        }
        // Store each value
        for (const item of values) {
          stateMap.set(key, item.value);
        }
      }

      // Update context state
      stateValue = new StateValue('array', stateMap);
      qc.state = new ChargedState(stateValue);
      if (context.currentQueryContext) {
        context.currentQueryContext.state = qc.state;
      }
    } else if ('idx' in op) {
      const idxOp = op.idx;
      // Determine the key to look up
      let key = '0';
      if (idxOp.path && idxOp.path.length > 0) {
        const pathEntry = idxOp.path[0];
        if (pathEntry.tag === 'value' && pathEntry.value) {
          const v = pathEntry.value.value;
          if (typeof v === 'bigint') {
            key = String(v);
          } else if (v != null && typeof v === 'object' && 'value' in v) {
            key = String(v.value);
          } else {
            key = String(v);
          }
        }
      }

      // Look up in state map (or in a dup'd state on stack)
      let lookupMap = stateMap;
      // Check if there's a dup'd state on the stack we should read from
      if (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.value instanceof StateValue && top.value._type === 'array' && top.value._data instanceof Map) {
          // Pop the dup'd state reference and use it for lookup
          stack.pop();
          lookupMap = top.value._data;
        }
      }

      const found = lookupMap.get(key);
      if (found) {
        stack.push({ storage: true, value: found });
      } else {
        stack.push({ storage: true, value: StateValue.newNull() });
      }

      if (idxOp.pushPath) {
        savedKey = key;
      }
    } else if ('addi' in op) {
      const immediate = BigInt(op.addi.immediate);
      const top = stack.pop();
      const currentValue = extractCellBigInt(top.value);
      const alignment = extractCellAlignment(top.value);
      const newValue = currentValue + immediate;
      const newCell = StateValue.newCell({
        value: { value: newValue, alignment },
        alignment,
      });
      stack.push({ storage: true, value: newCell });
    } else if ('dup' in op) {
      // Push a read-only copy of the current state onto the stack
      const dupMap = new Map(stateMap);
      stack.push({ storage: false, value: new StateValue('array', dupMap) });
    } else if ('popeq' in op) {
      const top = stack.pop();
      if (top && top.value) {
        const v = top.value;
        if (v instanceof StateValue && v._type === 'cell') {
          // Return the cell data: { value: { value: bigint, alignment }, alignment }
          return v._data;
        }
      }
      return top ? top.value : undefined;
    }
  }

  return undefined;
}

export function typeError(circuit, argDesc, location, expected, actual) {
  throw new CompactError(
    `Type error in ${circuit}: ${argDesc} at ${location} expected ${expected}, got ${typeof actual}`
  );
}
