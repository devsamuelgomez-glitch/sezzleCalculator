import { describe, expect, it } from 'vitest';
import {
  calculatorReducer,
  initialState,
  type Action,
  type BinaryOperator,
  type CalculatorState,
  type Digit,
  type UnaryOperator,
} from './calculator';

const from = (state: CalculatorState, ...actions: Action[]): CalculatorState =>
  actions.reduce(calculatorReducer, state);

const run = (...actions: Action[]): CalculatorState =>
  from(initialState, ...actions);

// "12.5" -> digit/decimal actions
const keys = (text: string): Action[] =>
  [...text].map((c) =>
    c === '.' ? { type: 'decimal' } : { type: 'digit', digit: c as Digit },
  );

const op = (operator: BinaryOperator): Action => ({
  type: 'selectBinaryOp',
  op: operator,
});
const unary = (operator: UnaryOperator): Action => ({
  type: 'selectUnaryOp',
  op: operator,
});
const equals: Action = { type: 'equals' };
const clear: Action = { type: 'clear' };
const backspace: Action = { type: 'backspace' };
const toggleSign: Action = { type: 'toggleSign' };
const decimal: Action = { type: 'decimal' };
const result = (value: number): Action => ({
  type: 'resultReceived',
  result: value,
});
const failed = (message: string): Action => ({ type: 'failed', message });

// 2 + 3 = and the API answering 5
const twoPlusThree = [...keys('2'), op('add'), ...keys('3'), equals];

describe('initial state', () => {
  it('shows 0, is idle and has no request', () => {
    expect(initialState).toMatchObject({
      status: 'idle',
      entry: '0',
      error: null,
      request: null,
      pendingOp: null,
      left: null,
      lastResult: null,
    });
  });
});

describe('digit entry', () => {
  it('replaces the initial 0 and appends further digits', () => {
    const state = run(...keys('123'));
    expect(state.entry).toBe('123');
    expect(state.status).toBe('entering');
  });

  it('collapses leading zeros: "007" becomes "7"', () => {
    expect(run(...keys('007')).entry).toBe('7');
  });

  it('keeps a single 0 when 0 is typed repeatedly', () => {
    expect(run(...keys('000')).entry).toBe('0');
  });

  it('keeps zeros after the decimal point', () => {
    expect(run(...keys('0.05')).entry).toBe('0.05');
  });

  it('accepts at most 15 digits and ignores the rest', () => {
    const state = run(...keys('12345678901234567890'));
    expect(state.entry).toBe('123456789012345');
  });

  it('does not count the sign or the decimal point toward the 15 digits', () => {
    const state = run(...keys('1234567.8901234'), toggleSign);
    expect(state.entry).toBe('-1234567.8901234');
    expect(from(state, ...keys('56')).entry).toBe('-1234567.89012345');
  });
});

describe('decimal point', () => {
  it('starts an entry with "0."', () => {
    expect(run(decimal).entry).toBe('0.');
  });

  it('allows only one decimal point', () => {
    expect(run(...keys('1.5.2')).entry).toBe('1.52');
  });

  it('starts a new operand with "0." after an operator', () => {
    const state = run(...keys('5'), op('add'), decimal);
    expect(state.entry).toBe('0.');
    expect(state.status).toBe('entering');
  });
});

describe('toggleSign', () => {
  it('negates and un-negates the entry', () => {
    const negative = run(...keys('5'), toggleSign);
    expect(negative.entry).toBe('-5');
    expect(from(negative, toggleSign).entry).toBe('5');
  });

  it('never produces "-0"', () => {
    expect(run(...keys('0'), toggleSign).entry).toBe('0');
  });

  it('keeps the sign while a zero fraction is typed', () => {
    expect(run(decimal, toggleSign, ...keys('5')).entry).toBe('-0.5');
  });

  it('is ignored when no operand is being entered', () => {
    expect(run(toggleSign)).toEqual(initialState);
    const state = run(...keys('5'), op('add'));
    expect(from(state, toggleSign)).toEqual(state);
  });

  it('negates a displayed result', () => {
    const state = run(...twoPlusThree, result(5));
    expect(from(state, toggleSign).entry).toBe('-5');
  });
});

describe('backspace', () => {
  it('removes the last character', () => {
    expect(run(...keys('123'), backspace).entry).toBe('12');
  });

  it('falls back to "0" when the entry is emptied', () => {
    expect(run(...keys('5'), backspace).entry).toBe('0');
  });

  it('falls back to "0" rather than leaving a bare sign', () => {
    expect(run(...keys('5'), toggleSign, backspace).entry).toBe('0');
  });

  it('normalizes "-0" to "0"', () => {
    const state = run(decimal, toggleSign, ...keys('5'));
    expect(state.entry).toBe('-0.5');
    const once = from(state, backspace);
    expect(once.entry).toBe('-0.');
    expect(from(once, backspace).entry).toBe('0');
  });

  it('does nothing when no operand is being entered', () => {
    const state = run(...keys('5'), op('add'));
    expect(from(state, backspace)).toEqual(state);
  });

  it('does not edit a displayed result', () => {
    const state = run(...twoPlusThree, result(5));
    expect(from(state, backspace)).toEqual(state);
  });
});

describe('binary operators', () => {
  it('stores the left operand and waits for the right one', () => {
    const state = run(...keys('5'), op('add'));
    expect(state).toMatchObject({
      status: 'idle',
      left: 5,
      pendingOp: 'add',
      entry: '5',
      request: null,
    });
  });

  it('replaces the pending operator when another is chosen immediately', () => {
    const state = run(...keys('5'), op('add'), op('subtract'));
    expect(state.pendingOp).toBe('subtract');
    expect(state.request).toBeNull();
  });

  it('starts the next operand with a fresh entry', () => {
    const state = run(...keys('5'), op('add'), ...keys('7'));
    expect(state.entry).toBe('7');
    expect(state.status).toBe('entering');
  });

  it('can start from the initial 0', () => {
    expect(run(op('subtract'))).toMatchObject({
      left: 0,
      pendingOp: 'subtract',
    });
  });
});

describe('equals', () => {
  it('emits a request intent instead of computing', () => {
    const state = run(...twoPlusThree);
    expect(state.status).toBe('awaiting-result');
    expect(state.request).toEqual({ operation: 'add', a: 2, b: 3 });
    expect(state.entry).toBe('3');
  });

  it('shows the result and clears the request when it arrives', () => {
    const state = run(...twoPlusThree, result(5));
    expect(state).toMatchObject({
      status: 'entering',
      entry: '5',
      lastResult: 5,
      request: null,
      pendingOp: null,
      left: null,
    });
  });

  it('is blocked when nothing has been entered', () => {
    expect(run(equals)).toEqual(initialState);
  });

  it('is blocked when the right operand is missing', () => {
    const state = run(...keys('5'), op('add'));
    expect(from(state, equals)).toEqual(state);
  });

  it('is blocked when there is no operator', () => {
    const state = run(...keys('5'));
    expect(from(state, equals)).toEqual(state);
  });

  it('lets a typed digit replace a displayed result', () => {
    const state = run(...twoPlusThree, result(5));
    expect(from(state, ...keys('9')).entry).toBe('9');
  });

  it('lets a decimal point start a new entry after a result', () => {
    const state = run(...twoPlusThree, result(5));
    expect(from(state, decimal).entry).toBe('0.');
  });

  it.each<[BinaryOperator, number, number]>([
    ['subtract', 9, 4],
    ['multiply', 6, 7],
    ['divide', 8, 2],
    ['power', 2, 10],
  ])('requests %s with both operands', (operation, a, b) => {
    const state = run(
      ...keys(String(a)),
      op(operation),
      ...keys(String(b)),
      equals,
    );
    expect(state.request).toEqual({ operation, a, b });
  });

  it('sends negative and fractional operands as numbers', () => {
    const state = run(
      ...keys('1.5'),
      toggleSign,
      op('multiply'),
      ...keys('2'),
      equals,
    );
    expect(state.request).toEqual({ operation: 'multiply', a: -1.5, b: 2 });
  });
});

describe('requests in flight', () => {
  const inFlight = run(...twoPlusThree);

  it.each<[string, Action]>([
    ['digit', { type: 'digit', digit: '9' }],
    ['decimal', decimal],
    ['toggleSign', toggleSign],
    ['backspace', backspace],
    ['binary operator', op('multiply')],
    ['unary operator', unary('sqrt')],
    ['equals', equals],
  ])('ignores %s', (_name, action) => {
    expect(from(inFlight, action)).toEqual(inFlight);
  });

  it('abandons the request on clear and ignores its late result', () => {
    const cleared = from(inFlight, clear);
    expect(cleared).toEqual(initialState);
    expect(from(cleared, result(5))).toEqual(initialState);
  });

  it('ignores a stale result when nothing is in flight', () => {
    const state = run(...keys('5'));
    expect(from(state, result(99))).toEqual(state);
  });

  it('ignores a stale failure when nothing is in flight', () => {
    const state = run(...keys('5'));
    expect(from(state, failed('late'))).toEqual(state);
  });
});

describe('operator chaining', () => {
  const afterSecondOperator = run(
    ...keys('2'),
    op('add'),
    ...keys('3'),
    op('multiply'),
  );

  it('requests the pending operation when a second operator is chosen', () => {
    expect(afterSecondOperator.status).toBe('awaiting-result');
    expect(afterSecondOperator.request).toEqual({
      operation: 'add',
      a: 2,
      b: 3,
    });
  });

  it('carries the result forward as the new left operand', () => {
    expect(from(afterSecondOperator, result(5))).toMatchObject({
      status: 'idle',
      left: 5,
      pendingOp: 'multiply',
      entry: '5',
      request: null,
    });
  });

  it('resolves 2 + 3 * 4 left to right: (2 + 3) * 4 = 20', () => {
    const second = from(afterSecondOperator, result(5), ...keys('4'), equals);
    expect(second.request).toEqual({ operation: 'multiply', a: 5, b: 4 });

    const done = from(second, result(20));
    expect(done.entry).toBe('20');
    expect(done.status).toBe('entering');
  });

  it('continues from a result with a new operator', () => {
    const state = run(
      ...twoPlusThree,
      result(5),
      op('multiply'),
      ...keys('4'),
      equals,
    );
    expect(state.request).toEqual({ operation: 'multiply', a: 5, b: 4 });
  });
});

describe('repeated equals (repeats the last operation with the same right operand)', () => {
  const afterFirst = run(...twoPlusThree, result(5));

  it('requests result + operand again', () => {
    const state = from(afterFirst, equals);
    expect(state.status).toBe('awaiting-result');
    expect(state.request).toEqual({ operation: 'add', a: 5, b: 3 });
  });

  it('keeps repeating on each press: 2 + 3 = = = gives 5, 8, 11', () => {
    const second = from(afterFirst, equals, result(8));
    expect(second.entry).toBe('8');
    expect(from(second, equals).request).toEqual({
      operation: 'add',
      a: 8,
      b: 3,
    });
  });

  it('applies to a newly typed left operand', () => {
    const state = from(afterFirst, ...keys('10'), equals);
    expect(state.request).toEqual({ operation: 'add', a: 10, b: 3 });
  });

  it('is replaced by a new operation', () => {
    const state = from(
      afterFirst,
      op('multiply'),
      ...keys('2'),
      equals,
      result(10),
      equals,
    );
    expect(state.request).toEqual({ operation: 'multiply', a: 10, b: 2 });
  });

  it('does nothing after clear', () => {
    const cleared = from(afterFirst, clear);
    expect(from(cleared, equals)).toEqual(cleared);
  });

  it('is not triggered by a unary result', () => {
    const state = run(...keys('9'), unary('sqrt'), result(3));
    expect(from(state, equals)).toEqual(state);
  });
});

describe('unary operators', () => {
  it('requests sqrt of the current entry', () => {
    const state = run(...keys('144'), unary('sqrt'));
    expect(state.status).toBe('awaiting-result');
    expect(state.request).toEqual({ operation: 'sqrt', a: 144 });
  });

  it('shows the result as an operand and keeps the pending operation', () => {
    const state = run(
      ...keys('5'),
      op('add'),
      ...keys('9'),
      unary('sqrt'),
      result(3),
    );
    expect(state).toMatchObject({
      status: 'entering',
      entry: '3',
      left: 5,
      pendingOp: 'add',
    });
    expect(from(state, equals).request).toEqual({
      operation: 'add',
      a: 5,
      b: 3,
    });
  });

  it('treats percent as "a percent of the left operand" after + or -', () => {
    const state = run(
      ...keys('200'),
      op('add'),
      ...keys('15'),
      unary('percent'),
    );
    expect(state.request).toEqual({ operation: 'percentage', a: 15, b: 200 });
  });

  it('treats percent as a / 100 after * or /', () => {
    const state = run(
      ...keys('200'),
      op('multiply'),
      ...keys('15'),
      unary('percent'),
    );
    expect(state.request).toEqual({ operation: 'percentage', a: 15, b: 1 });
  });

  it('treats a standalone percent as a / 100', () => {
    const state = run(...keys('50'), unary('percent'));
    expect(state.request).toEqual({ operation: 'percentage', a: 50, b: 1 });
  });

  it('is blocked when an operator is pending and no operand was entered', () => {
    const state = run(...keys('5'), op('add'));
    expect(from(state, unary('sqrt'))).toEqual(state);
    expect(from(state, unary('percent'))).toEqual(state);
  });

  it('operates on a displayed result', () => {
    const state = run(...twoPlusThree, result(4), unary('sqrt'));
    expect(state.request).toEqual({ operation: 'sqrt', a: 4 });
  });
});

describe('clear', () => {
  it('resets everything', () => {
    expect(run(...keys('5'), op('add'), ...keys('3'), clear)).toEqual(
      initialState,
    );
  });
});

describe('errors', () => {
  const divideByZero = run(
    ...keys('1'),
    op('divide'),
    ...keys('0'),
    equals,
    failed('cannot divide by zero'),
  );

  it('records the message and keeps the entry and operands', () => {
    expect(divideByZero).toMatchObject({
      status: 'error',
      error: 'cannot divide by zero',
      request: null,
      entry: '0',
      left: 1,
      pendingOp: 'divide',
    });
  });

  it('clears the error on the next digit and starts a new entry', () => {
    expect(from(divideByZero, ...keys('2'))).toMatchObject({
      status: 'entering',
      error: null,
      entry: '2',
    });
  });

  it('recovers: the corrected operand can be sent again', () => {
    const state = from(divideByZero, ...keys('2'), equals);
    expect(state.request).toEqual({ operation: 'divide', a: 1, b: 2 });
    expect(from(state, result(0.5)).entry).toBe('0.5');
  });

  it('starts a "0." entry when the next input is a decimal point', () => {
    expect(from(divideByZero, decimal)).toMatchObject({
      error: null,
      entry: '0.',
    });
  });

  it.each<[string, Action]>([
    ['equals', equals],
    ['binary operator', op('add')],
    ['unary operator', unary('sqrt')],
    ['toggleSign', toggleSign],
    ['backspace', backspace],
  ])('only dismisses the error on %s', (_name, action) => {
    const state = from(divideByZero, action);
    expect(state.error).toBeNull();
    expect(state.request).toBeNull();
    expect(state.status).toBe('entering');
    expect(state.entry).toBe('0');
    expect(state.pendingOp).toBe('divide');
  });

  it('is fully reset by clear', () => {
    expect(from(divideByZero, clear)).toEqual(initialState);
  });

  it('recovers from a failed unary operation', () => {
    const state = run(
      ...keys('4'),
      toggleSign,
      unary('sqrt'),
      failed('cannot take the square root of a negative number'),
    );
    expect(state.status).toBe('error');
    expect(state.entry).toBe('-4');
    const recovered = from(state, ...keys('9'), unary('sqrt'));
    expect(recovered.request).toEqual({ operation: 'sqrt', a: 9 });
  });

  it('recovers from a failed chain request', () => {
    const state = run(
      ...keys('1'),
      op('divide'),
      ...keys('0'),
      op('add'),
      failed('cannot divide by zero'),
    );
    expect(state.status).toBe('error');
    expect(from(state, ...keys('4'), equals).request).toEqual({
      operation: 'divide',
      a: 1,
      b: 4,
    });
  });
});
