// Pure calculator state machine. It never computes: when a result is needed it
// stores a request intent in `state.request` and waits for `resultReceived` or
// `failed`, which the caller dispatches after talking to the API.

import type { CalculateRequest } from '../api/types';
import { formatResult } from './format';

export const MAX_DIGITS = 15;

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type BinaryOperator =
  'add' | 'subtract' | 'multiply' | 'divide' | 'power';
export type UnaryOperator = 'sqrt' | 'percent';

// idle: no operand entered yet (start, after clear, after an operator).
// entering: `entry` holds an operand, typed or received from the API.
export type Status = 'idle' | 'entering' | 'awaiting-result' | 'error';

interface Repeat {
  operation: BinaryOperator;
  operand: number;
}

// What to do with the API result once it arrives.
type Continuation =
  | { kind: 'operand' }
  | { kind: 'chain'; op: BinaryOperator }
  | { kind: 'equals'; repeat: Repeat };

export interface CalculatorState {
  status: Status;
  /** Text shown on the display; also the operand being typed. */
  entry: string;
  /** True when `entry` is a received result, so the next digit replaces it. */
  fresh: boolean;
  left: number | null;
  pendingOp: BinaryOperator | null;
  lastResult: number | null;
  error: string | null;
  /** Set while `status` is 'awaiting-result': the call the caller must make. */
  request: CalculateRequest | null;
  onResult: Continuation | null;
  /** Last `=` operation, replayed by pressing `=` again. */
  repeat: Repeat | null;
}

export type Action =
  | { type: 'digit'; digit: Digit }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'clear' }
  | { type: 'backspace' }
  | { type: 'selectBinaryOp'; op: BinaryOperator }
  | { type: 'selectUnaryOp'; op: UnaryOperator }
  | { type: 'equals' }
  | { type: 'resultReceived'; result: number }
  | { type: 'failed'; message: string };

type InputAction = Exclude<
  Action,
  { type: 'clear' | 'resultReceived' | 'failed' }
>;

export const initialState: CalculatorState = {
  status: 'idle',
  entry: '0',
  fresh: false,
  left: null,
  pendingOp: null,
  lastResult: null,
  error: null,
  request: null,
  onResult: null,
  repeat: null,
};

function countDigits(entry: string): number {
  return entry.replace(/\D/g, '').length;
}

// Never leave "", "-" or "-0" behind.
function normalize(entry: string): string {
  return entry === '' || entry === '-' || entry === '-0' ? '0' : entry;
}

// A fresh operand is being typed, as opposed to editing one in place.
function isEditing(state: CalculatorState): boolean {
  return state.status === 'entering' && !state.fresh;
}

function enterDigit(state: CalculatorState, digit: Digit): CalculatorState {
  if (!isEditing(state)) {
    return { ...state, status: 'entering', fresh: false, entry: digit };
  }
  if (countDigits(state.entry) >= MAX_DIGITS) return state;
  return {
    ...state,
    entry: state.entry === '0' ? digit : state.entry + digit,
  };
}

function enterDecimal(state: CalculatorState): CalculatorState {
  if (!isEditing(state)) {
    return { ...state, status: 'entering', fresh: false, entry: '0.' };
  }
  if (state.entry.includes('.')) return state;
  return { ...state, entry: `${state.entry}.` };
}

function toggleSign(state: CalculatorState): CalculatorState {
  if (state.status !== 'entering') return state;
  const negated = state.entry.startsWith('-')
    ? state.entry.slice(1)
    : `-${state.entry}`;
  return { ...state, entry: normalize(negated) };
}

function backspace(state: CalculatorState): CalculatorState {
  if (!isEditing(state)) return state;
  return { ...state, entry: normalize(state.entry.slice(0, -1)) };
}

function request(
  state: CalculatorState,
  req: CalculateRequest,
  onResult: Continuation,
): CalculatorState {
  return { ...state, status: 'awaiting-result', request: req, onResult };
}

function selectBinaryOp(
  state: CalculatorState,
  op: BinaryOperator,
): CalculatorState {
  if (state.status === 'idle' && state.pendingOp !== null) {
    return { ...state, pendingOp: op };
  }
  if (
    state.status === 'entering' &&
    state.pendingOp !== null &&
    state.left !== null
  ) {
    return request(
      state,
      { operation: state.pendingOp, a: state.left, b: Number(state.entry) },
      { kind: 'chain', op },
    );
  }
  return {
    ...state,
    status: 'idle',
    fresh: false,
    left: Number(state.entry),
    pendingOp: op,
    repeat: null,
  };
}

function selectUnaryOp(
  state: CalculatorState,
  op: UnaryOperator,
): CalculatorState {
  // An operator is waiting for its right operand: nothing to apply to.
  if (state.status === 'idle' && state.pendingOp !== null) return state;

  const a = Number(state.entry);
  if (op === 'sqrt') {
    return request(state, { operation: 'sqrt', a }, { kind: 'operand' });
  }
  // "a percent of the left operand" after + or -, plain a / 100 otherwise.
  const addsOrSubtracts =
    state.pendingOp === 'add' || state.pendingOp === 'subtract';
  const b = addsOrSubtracts && state.left !== null ? state.left : 1;
  return request(state, { operation: 'percentage', a, b }, { kind: 'operand' });
}

function equals(state: CalculatorState): CalculatorState {
  if (state.status !== 'entering') return state;
  const entered = Number(state.entry);

  if (state.pendingOp !== null && state.left !== null) {
    const repeat = { operation: state.pendingOp, operand: entered };
    return request(
      state,
      { operation: state.pendingOp, a: state.left, b: entered },
      { kind: 'equals', repeat },
    );
  }
  if (state.repeat !== null) {
    return request(
      state,
      {
        operation: state.repeat.operation,
        a: entered,
        b: state.repeat.operand,
      },
      { kind: 'equals', repeat: state.repeat },
    );
  }
  return state;
}

function applyInput(
  state: CalculatorState,
  action: InputAction,
): CalculatorState {
  switch (action.type) {
    case 'digit':
      return enterDigit(state, action.digit);
    case 'decimal':
      return enterDecimal(state);
    case 'toggleSign':
      return toggleSign(state);
    case 'backspace':
      return backspace(state);
    case 'selectBinaryOp':
      return selectBinaryOp(state, action.op);
    case 'selectUnaryOp':
      return selectUnaryOp(state, action.op);
    case 'equals':
      return equals(state);
  }
}

function receiveResult(state: CalculatorState, value: number): CalculatorState {
  const { onResult } = state;
  if (state.status !== 'awaiting-result' || onResult === null) return state;

  const base = {
    ...state,
    entry: formatResult(value),
    lastResult: value,
    request: null,
    onResult: null,
  };
  switch (onResult.kind) {
    case 'operand':
      return { ...base, status: 'entering', fresh: true };
    case 'equals':
      return {
        ...base,
        status: 'entering',
        fresh: true,
        left: null,
        pendingOp: null,
        repeat: onResult.repeat,
      };
    case 'chain':
      return {
        ...base,
        status: 'idle',
        fresh: false,
        left: value,
        pendingOp: onResult.op,
      };
  }
}

function fail(state: CalculatorState, message: string): CalculatorState {
  if (state.status !== 'awaiting-result') return state;
  // Operands stay as they were so the user can correct the entry and retry.
  return {
    ...state,
    status: 'error',
    error: message,
    request: null,
    onResult: null,
  };
}

export function calculatorReducer(
  state: CalculatorState,
  action: Action,
): CalculatorState {
  switch (action.type) {
    case 'resultReceived':
      return receiveResult(state, action.result);
    case 'failed':
      return fail(state, action.message);
    case 'clear':
      // Also abandons a request in flight; its late reply is then ignored.
      return initialState;
  }

  if (state.status === 'awaiting-result') return state;

  if (state.status === 'error') {
    // The first input after an error dismisses it. Only digits and the decimal
    // point also take effect, replacing the entry that caused the error.
    const dismissed: CalculatorState = {
      ...state,
      status: 'entering',
      fresh: true,
      error: null,
    };
    return action.type === 'digit' || action.type === 'decimal'
      ? applyInput(dismissed, action)
      : dismissed;
  }

  return applyInput(state, action);
}
