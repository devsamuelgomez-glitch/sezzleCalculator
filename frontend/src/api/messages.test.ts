import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from './client';
import { NETWORK_MESSAGE, describeError } from './messages';

describe('describeError', () => {
  it.each<[ApiError['code'], string]>([
    ['division_by_zero', 'Cannot divide by zero'],
    ['negative_sqrt', 'Cannot take the square root of a negative number'],
    ['non_finite_result', 'The result is not a finite number'],
  ])('maps %s to a friendly message', (code, message) => {
    expect(describeError(new ApiError(422, code, 'server text'))).toBe(message);
  });

  it('never shows raw server text for unexpected codes', () => {
    const message = describeError(new ApiError(502, 'unknown', '<html>'));
    expect(message).toBe('Something went wrong. Please try again.');
  });

  it('gives network failures their own message', () => {
    expect(describeError(new NetworkError(new TypeError('x')))).toBe(
      NETWORK_MESSAGE,
    );
  });

  it('falls back to a generic message for anything else', () => {
    expect(describeError(new Error('boom'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
