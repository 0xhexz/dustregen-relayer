declare module '@midnight-ntwrk/compact-runtime' {
  export function checkRuntimeVersion(version: string): void;

  export class CompactTypeUnsignedInteger {
    constructor(maxValue: bigint, byteWidth: number);
    alignment(): any;
    toValue(n: bigint): any;
    fromValue(cell: any): bigint;
  }

  export const CompactTypeBoolean: {
    alignment(): any;
    toValue(b: boolean): any;
    fromValue(cell: any): boolean;
  };

  export class CompactTypeBytes {
    constructor(length: number);
    alignment(): any;
    toValue(b: any): any;
    fromValue(cell: any): any;
  }

  export class CompactError extends Error {
    constructor(message: string);
  }

  export class ContractOperation {
    name: string;
  }

  export class StateValue {
    static newArray(): StateValue;
    static newNull(): StateValue;
    static newCell(cellData: any): StateValue;
    arrayPush(item: StateValue): StateValue;
    encode(): any;
  }

  export class ChargedState {
    state: StateValue;
    constructor(stateValue: StateValue | ChargedState);
  }

  export class ContractState {
    data: ChargedState;
    setOperation(name: string, op: ContractOperation): void;
  }

  export class QueryContext {
    state: ChargedState;
    constructor(chargedState: ChargedState | StateValue, contractAddress: string);
  }

  export const CostModel: {
    initialCostModel(): any;
  };

  export function dummyContractAddress(): string;
  export function emptyRunningCost(): any;
  export function valueToBigInt(cell: any): bigint;

  export interface ConstructorContext<PS> {
    initialPrivateState: PS;
    initialZswapLocalState: any;
  }

  export interface ConstructorResult<PS> {
    currentContractState: ContractState;
    currentPrivateState: PS;
    currentZswapLocalState: any;
  }

  export interface CircuitContext<PS> {
    contractAddress: string;
    currentZswapLocalState: any;
    currentQueryContext: QueryContext;
    currentPrivateState: PS;
  }

  export interface CircuitResults<PS, R extends any[]> {
    result: R;
    context: CircuitContext<PS>;
    proofData: any;
    gasCost: any;
  }

  export function constructorContext<PS>(privateState: PS, coinPublicKey: string): ConstructorContext<PS>;
  export function createCircuitContext<PS>(
    contractAddress: string,
    zswapLocalState: any,
    chargedState: ChargedState | StateValue,
    privateState: PS,
  ): CircuitContext<PS>;
  export function queryLedgerState(context: any, partialProofData: any, operations: any[]): any;

  export function typeError(circuit: string, argDesc: string, location: string, expected: string, actual: any): never;
}
