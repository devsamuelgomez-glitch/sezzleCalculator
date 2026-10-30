import { describe, expect, it } from 'vitest';
import { actionForKey } from './keyboard';

describe('actionForKey', () => {
  it.each<[string, unknown]>([
    ['7', { type: 'digit', digit: '7' }],
    ['.', { type: 'decimal' }],
    [',', { type: 'decimal' }],
    ['+', { type: 'selectBinaryOp', op: 'add' }],
    ['-', { type: 'selectBinaryOp', op: 'subtract' }],
    ['*', { type: 'selectBinaryOp', op: 'multiply' }],
    ['x', { type: 'selectBinaryOp', op: 'multiply' }],
    ['X', { type: 'selectBinaryOp', op: 'multiply' }],
    ['/', { type: 'selectBinaryOp', op: 'divide' }],
    ['^', { type: 'selectBinaryOp', op: 'power' }],
    ['%', { type: 'selectUnaryOp', op: 'percent' }],
    ['Enter', { type: 'equals' }],
    ['=', { type: 'equals' }],
    ['Backspace', { type: 'backspace' }],
    ['Escape', { type: 'clear' }],
  ])('maps %s', (key, action) => {
    expect(actionForKey(key)).toEqual(action);
  });

  it.each(['a', 'Shift', 'Tab', 'F5', '10', ''])('ignores %j', (key) => {
    expect(actionForKey(key)).toBeNull();
  });
});
