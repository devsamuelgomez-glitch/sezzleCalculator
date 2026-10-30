import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { ApiError, NetworkError, type CalculatorClient } from './api/client';
import type { CalculateRequest, CalculateResponse } from './api/types';

type Calculate = CalculatorClient['calculate'];

function fakeClient(impl: Calculate) {
  const calculate = vi.fn<Calculate>(impl);
  return { calculate } satisfies CalculatorClient;
}

// A request the test resolves or rejects by hand.
function deferredClient() {
  let resolve: (res: CalculateResponse) => void = () => undefined;
  const client = fakeClient(
    () =>
      new Promise<CalculateResponse>((res) => {
        resolve = res;
      }),
  );
  return { client, resolve: (res: CalculateResponse) => resolve(res) };
}

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const pressAll = (...names: string[]) => names.forEach(press);
const typeKeys = (...keys: string[]) =>
  keys.forEach((key) => fireEvent.keyDown(document.body, { key }));

const display = () => screen.getByRole('status').textContent;
const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

describe('App', () => {
  it('computes 12 + 30 = 42 through the API', async () => {
    const client = fakeClient(async () => ({ result: 42 }));
    render(<App client={client} />);

    pressAll('1', '2', 'add', '3', '0');
    expect(display()).toBe('30');
    press('equals');

    await waitFor(() => expect(display()).toBe('42'));
    expect(client.calculate).toHaveBeenCalledTimes(1);
    expect(client.calculate.mock.calls[0]?.[0]).toEqual({
      operation: 'add',
      a: 12,
      b: 30,
    });
  });

  it('shows the pending operation above the display', () => {
    render(<App client={fakeClient(async () => ({ result: 0 }))} />);
    pressAll('1', '2', 'multiply');
    expect(screen.getByText('12 ×')).toBeTruthy();
  });

  it('rounds float noise from the API for display', async () => {
    const client = fakeClient(async () => ({ result: 0.1 + 0.2 }));
    render(<App client={client} />);
    pressAll('1', 'add', '2', 'equals');
    await waitFor(() => expect(display()).toBe('0.3'));
  });

  it('shows division by zero in an alert and recovers', async () => {
    const client = fakeClient(async (req: CalculateRequest) => {
      if (req.b === 0) {
        throw new ApiError(422, 'division_by_zero', 'cannot divide by zero');
      }
      return { result: 0.5 };
    });
    render(<App client={client} />);

    pressAll('1', 'divide', '0', 'equals');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Cannot divide by zero');

    press('2');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(display()).toBe('2');

    press('equals');
    await waitFor(() => expect(display()).toBe('0.5'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a distinct message for network failure', async () => {
    const client = fakeClient(async () => {
      throw new NetworkError(new TypeError('Failed to fetch'));
    });
    render(<App client={client} />);

    pressAll('1', 'add', '1', 'equals');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/can't reach the server/i);
  });

  it('disables input, except clear, while a request is in flight', async () => {
    const { client, resolve } = deferredClient();
    render(<App client={client} />);

    pressAll('2', 'add', '3', 'equals');

    expect(button('7').disabled).toBe(true);
    expect(button('add').disabled).toBe(true);
    expect(button('equals').disabled).toBe(true);
    expect(button('clear').disabled).toBe(false);
    expect(screen.getByRole('region', { name: 'Display' }).ariaBusy).toBe(
      'true',
    );

    // Keyboard input is ignored too.
    typeKeys('9');
    expect(display()).toBe('3');

    resolve({ result: 5 });
    await waitFor(() => expect(display()).toBe('5'));
    expect(button('7').disabled).toBe(false);
  });

  it('cancels the request and resets when clear is pressed', async () => {
    const { client, resolve } = deferredClient();
    render(<App client={client} />);

    pressAll('2', 'add', '3', 'equals');
    const signal = client.calculate.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);

    press('clear');
    expect(signal?.aborted).toBe(true);
    expect(display()).toBe('0');
    expect(button('7').disabled).toBe(false);

    // A reply that still arrives is ignored.
    resolve({ result: 5 });
    await Promise.resolve();
    expect(display()).toBe('0');
  });

  it('cancels the request on unmount', () => {
    const { client } = deferredClient();
    const { unmount } = render(<App client={client} />);

    pressAll('2', 'add', '3', 'equals');
    const signal = client.calculate.mock.calls[0]?.[1]?.signal;
    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('supports the keyboard: digits, operators, Enter, Backspace, Escape', async () => {
    const client = fakeClient(async () => ({ result: 42 }));
    render(<App client={client} />);

    typeKeys('1', '2', '+', '3', '0');
    expect(display()).toBe('30');
    typeKeys('Backspace', '0');
    expect(display()).toBe('30');

    typeKeys('Enter');
    await waitFor(() => expect(display()).toBe('42'));
    expect(client.calculate.mock.calls[0]?.[0]).toEqual({
      operation: 'add',
      a: 12,
      b: 30,
    });

    typeKeys('Escape');
    expect(display()).toBe('0');
  });

  it('maps * / - ^ % = and . on the keyboard', () => {
    const client = fakeClient(async () => ({ result: 1 }));
    render(<App client={client} />);

    typeKeys('4', '.', '5', '*');
    expect(screen.getByText('4.5 ×')).toBeTruthy();
    typeKeys('/');
    expect(screen.getByText('4.5 ÷')).toBeTruthy();
    typeKeys('-');
    expect(screen.getByText('4.5 −')).toBeTruthy();
    typeKeys('^');
    expect(screen.getByText('4.5 ^')).toBeTruthy();
    typeKeys('2', '=');
    expect(client.calculate.mock.calls[0]?.[0]).toEqual({
      operation: 'power',
      a: 4.5,
      b: 2,
    });
  });

  it('does not press a focused button twice when Enter is used', () => {
    const client = fakeClient(async () => ({ result: 5 }));
    render(<App client={client} />);
    pressAll('2', 'add', '3');

    // The browser turns Enter on a button into a click; the window handler
    // must stay out of the way so equals is not sent twice.
    fireEvent.keyDown(button('equals'), { key: 'Enter' });
    expect(client.calculate).not.toHaveBeenCalled();
  });

  it('ignores keys pressed with a modifier', () => {
    render(<App client={fakeClient(async () => ({ result: 1 }))} />);
    fireEvent.keyDown(document.body, { key: '5', ctrlKey: true });
    expect(display()).toBe('0');
  });

  it('exposes every operation as a button with an accessible name', () => {
    render(<App client={fakeClient(async () => ({ result: 1 }))} />);
    for (const name of [
      'add',
      'subtract',
      'multiply',
      'divide',
      'power',
      'square root',
      'percent',
      'equals',
      'clear',
      'backspace',
      'toggle sign',
      'decimal point',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('requests a square root', async () => {
    const client = fakeClient(async () => ({ result: 12 }));
    render(<App client={client} />);
    pressAll('1', '4', '4', 'square root');
    await waitFor(() => expect(display()).toBe('12'));
    expect(client.calculate.mock.calls[0]?.[0]).toEqual({
      operation: 'sqrt',
      a: 144,
    });
  });
});
