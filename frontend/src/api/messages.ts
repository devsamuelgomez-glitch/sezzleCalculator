import { ApiError, NetworkError, type ApiErrorCode } from './client';

const GENERIC = 'Something went wrong. Please try again.';

export const NETWORK_MESSAGE =
  "Can't reach the server. Check your connection and try again.";

const API_MESSAGES: Record<ApiErrorCode, string> = {
  division_by_zero: 'Cannot divide by zero',
  negative_sqrt: 'Cannot take the square root of a negative number',
  non_finite_result: 'The result is not a finite number',
  internal: 'The server had a problem. Please try again.',
  // Request-shape errors mean a bug in this app, not something the user did.
  invalid_json: GENERIC,
  unknown_operation: GENERIC,
  missing_operand: GENERIC,
  unexpected_operand: GENERIC,
  method_not_allowed: GENERIC,
  unsupported_media_type: GENERIC,
  unknown: GENERIC,
};

export function describeError(err: unknown): string {
  if (err instanceof NetworkError) return NETWORK_MESSAGE;
  if (err instanceof ApiError) return API_MESSAGES[err.code];
  return GENERIC;
}
