import { describe, expect, it } from 'vitest';
import { formatResult } from './format';

describe('formatResult', () => {
  it.each<[number, string]>([
    [42, '42'],
    [0.5, '0.5'],
    [0.1 + 0.2, '0.3'],
    [1 / 3, '0.333333333333'],
    [-2.5, '-2.5'],
    [1e21, '1e+21'],
    [123456789012345, '123456789012000'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatResult(value)).toBe(expected);
  });
});
