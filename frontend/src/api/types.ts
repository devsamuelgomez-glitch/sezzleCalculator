// Mirrors the API contract in docs/DESIGN.md.

export type Operation =
  'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'percentage';

// `b` is required for every operation except `sqrt`, which rejects it.
export interface CalculateRequest {
  operation: Operation;
  a: number;
  b?: number;
}

export interface CalculateResponse {
  result: number;
}

export type ErrorCode =
  | 'invalid_json'
  | 'unknown_operation'
  | 'missing_operand'
  | 'unexpected_operand'
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'division_by_zero'
  | 'negative_sqrt'
  | 'non_finite_result'
  | 'internal';

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
  };
}
