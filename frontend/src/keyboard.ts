import type { Action, Digit } from './state/calculator';

export function actionForKey(key: string): Action | null {
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: key as Digit };
  switch (key) {
    case '.':
    case ',':
      return { type: 'decimal' };
    case '+':
      return { type: 'selectBinaryOp', op: 'add' };
    case '-':
      return { type: 'selectBinaryOp', op: 'subtract' };
    case '*':
    case 'x':
    case 'X':
      return { type: 'selectBinaryOp', op: 'multiply' };
    case '/':
      return { type: 'selectBinaryOp', op: 'divide' };
    case '^':
      return { type: 'selectBinaryOp', op: 'power' };
    case '%':
      return { type: 'selectUnaryOp', op: 'percent' };
    case 'Enter':
    case '=':
      return { type: 'equals' };
    case 'Backspace':
      return { type: 'backspace' };
    case 'Escape':
      return { type: 'clear' };
    default:
      return null;
  }
}
