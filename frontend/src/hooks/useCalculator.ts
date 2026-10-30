import { useEffect, useReducer } from 'react';
import type { CalculatorClient } from '../api/client';
import { describeError } from '../api/messages';
import { calculatorReducer, initialState } from '../state/calculator';

// Wires the pure reducer to the API: whenever the reducer emits a request
// intent, call the client and feed the reply back. Dropping the request
// (clear, unmount) aborts the call through the effect cleanup.
export function useCalculator(client: CalculatorClient) {
  const [state, dispatch] = useReducer(calculatorReducer, initialState);
  const { request } = state;

  useEffect(() => {
    if (request === null) return;
    const controller = new AbortController();
    const { signal } = controller;

    client.calculate(request, { signal }).then(
      ({ result }) => {
        if (!signal.aborted) dispatch({ type: 'resultReceived', result });
      },
      (err: unknown) => {
        if (!signal.aborted) {
          dispatch({ type: 'failed', message: describeError(err) });
        }
      },
    );
    return () => controller.abort();
  }, [client, request]);

  return { state, dispatch };
}
