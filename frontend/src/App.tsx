import { useEffect } from 'react';
import type { CalculatorClient } from './api/client';
import { Display } from './components/Display';
import { Keypad } from './components/Keypad';
import { useCalculator } from './hooks/useCalculator';
import { actionForKey } from './keyboard';
import type { BinaryOperator } from './state/calculator';
import { formatResult } from './state/format';

const OPERATOR_SYMBOLS: Record<BinaryOperator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
};

interface AppProps {
  client: CalculatorClient;
}

export default function App({ client }: AppProps) {
  const { state, dispatch } = useCalculator(client);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Enter on a focused button already clicks it; handling it here too
      // would press the key twice.
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) {
        return;
      }
      const action = actionForKey(event.key);
      if (action === null) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  const expression =
    state.pendingOp !== null && state.left !== null
      ? `${formatResult(state.left)} ${OPERATOR_SYMBOLS[state.pendingOp]}`
      : '';

  return (
    <main className="calculator">
      <h1 className="visually-hidden">Calculator</h1>
      <Display
        value={state.entry}
        expression={expression}
        error={state.error}
        busy={state.status === 'awaiting-result'}
      />
      <Keypad
        onAction={dispatch}
        disabled={state.status === 'awaiting-result'}
      />
    </main>
  );
}
