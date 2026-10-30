import type {
  CalculateRequest,
  CalculateResponse,
  ErrorCode,
  ErrorResponse,
} from './types';

// `unknown` covers responses that do not follow the error envelope
// (for example a proxy's HTML 502 page).
export type ApiErrorCode = ErrorCode | 'unknown';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('network request failed', { cause });
    this.name = 'NetworkError';
  }
}

export interface CalculatorClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface CalculatorClient {
  calculate(
    req: CalculateRequest,
    options?: { signal?: AbortSignal },
  ): Promise<CalculateResponse>;
}

function isErrorResponse(body: unknown): body is ErrorResponse {
  if (typeof body !== 'object' || body === null) return false;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string';
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export function createCalculatorClient({
  baseUrl = '',
  fetchImpl = (...args) => fetch(...args),
}: CalculatorClientOptions = {}): CalculatorClient {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/calculate`;

  return {
    async calculate(req, { signal } = {}) {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
          signal,
        });
      } catch (err) {
        // An abort is the caller's decision, not a network failure.
        if (signal?.aborted) throw err;
        throw new NetworkError(err);
      }

      const body = await readJson(res);

      if (!res.ok) {
        if (isErrorResponse(body)) {
          throw new ApiError(res.status, body.error.code, body.error.message);
        }
        throw new ApiError(
          res.status,
          'unknown',
          `request failed with status ${res.status}`,
        );
      }

      if (
        typeof body !== 'object' ||
        body === null ||
        typeof (body as { result?: unknown }).result !== 'number'
      ) {
        throw new ApiError(res.status, 'unknown', 'malformed success response');
      }
      return body as CalculateResponse;
    },
  };
}
