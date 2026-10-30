import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, createCalculatorClient } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientWith(fake: typeof fetch) {
  return createCalculatorClient({
    baseUrl: 'http://api.test',
    fetchImpl: fake,
  });
}

describe('calculator client', () => {
  it('posts the request as JSON and returns the result on success', async () => {
    const fake = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, { result: 5 }),
    );

    const res = await clientWith(fake).calculate({
      operation: 'add',
      a: 2,
      b: 3,
    });

    expect(res).toEqual({ result: 5 });
    expect(fake).toHaveBeenCalledOnce();
    const [url, init] = fake.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/api/v1/calculate');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({
      operation: 'add',
      a: 2,
      b: 3,
    });
  });

  it('uses a relative URL when no baseUrl is given', async () => {
    const fake = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, { result: 12 }),
    );

    await createCalculatorClient({ fetchImpl: fake }).calculate({
      operation: 'sqrt',
      a: 144,
    });

    expect(fake.mock.calls[0]?.[0]).toBe('/api/v1/calculate');
  });

  it('throws ApiError carrying status, code and message on a 4xx error body', async () => {
    const fake = async () =>
      jsonResponse(422, {
        error: {
          code: 'division_by_zero',
          message: 'cannot divide by zero',
        },
      });

    const err = await clientWith(fake)
      .calculate({ operation: 'divide', a: 1, b: 0 })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 422,
      code: 'division_by_zero',
      message: 'cannot divide by zero',
    });
  });

  it('throws ApiError with code "unknown" when the error body is not JSON', async () => {
    const fake = async () =>
      new Response('<html>Bad Gateway</html>', { status: 502 });

    const err = await clientWith(fake)
      .calculate({ operation: 'add', a: 1, b: 1 })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: 'unknown' });
  });

  it('throws NetworkError, keeping the cause, when fetch rejects', async () => {
    const cause = new TypeError('Failed to fetch');
    const fake = async (): Promise<Response> => {
      throw cause;
    };

    const err = await clientWith(fake)
      .calculate({ operation: 'add', a: 1, b: 1 })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as NetworkError).cause).toBe(cause);
  });

  it('passes the signal to fetch and rethrows the abort as-is', async () => {
    const controller = new AbortController();
    const fake = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );

    const pending = clientWith(fake)
      .calculate(
        { operation: 'add', a: 1, b: 1 },
        { signal: controller.signal },
      )
      .catch((e: unknown) => e);
    controller.abort();
    const err = await pending;

    expect(fake.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(err).toMatchObject({ name: 'AbortError' });
    expect(err).not.toBeInstanceOf(NetworkError);
  });

  it('throws ApiError when a 200 response lacks a numeric result', async () => {
    const fake = async () => jsonResponse(200, { result: 'five' });

    const err = await clientWith(fake)
      .calculate({ operation: 'add', a: 2, b: 3 })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'unknown' });
  });
});
