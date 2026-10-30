import type { Action, BinaryOperator, Digit } from '../state/calculator';
import { Key, type KeyVariant } from './Key';

interface KeyDef {
  label: string;
  name?: string;
  variant: KeyVariant;
  action: Action;
  wide?: boolean;
  /** Stays usable while a request is in flight (it cancels the request). */
  alwaysEnabled?: boolean;
}

const digit = (value: Digit): KeyDef => ({
  label: value,
  variant: 'digit',
  action: { type: 'digit', digit: value },
});

const binary = (label: string, name: BinaryOperator): KeyDef => ({
  label,
  name,
  variant: 'operator',
  action: { type: 'selectBinaryOp', op: name },
});

// Four columns, laid out row by row.
const KEYS: KeyDef[] = [
  {
    label: 'C',
    name: 'clear',
    variant: 'function',
    action: { type: 'clear' },
    alwaysEnabled: true,
  },
  {
    label: '⌫',
    name: 'backspace',
    variant: 'function',
    action: { type: 'backspace' },
  },
  {
    label: '√',
    name: 'square root',
    variant: 'function',
    action: { type: 'selectUnaryOp', op: 'sqrt' },
  },
  binary('xʸ', 'power'),
  digit('7'),
  digit('8'),
  digit('9'),
  binary('÷', 'divide'),
  digit('4'),
  digit('5'),
  digit('6'),
  binary('×', 'multiply'),
  digit('1'),
  digit('2'),
  digit('3'),
  binary('−', 'subtract'),
  {
    label: '±',
    name: 'toggle sign',
    variant: 'function',
    action: { type: 'toggleSign' },
  },
  digit('0'),
  {
    label: '.',
    name: 'decimal point',
    variant: 'digit',
    action: { type: 'decimal' },
  },
  binary('+', 'add'),
  {
    label: '%',
    name: 'percent',
    variant: 'function',
    action: { type: 'selectUnaryOp', op: 'percent' },
  },
  {
    label: '=',
    name: 'equals',
    variant: 'equals',
    action: { type: 'equals' },
    wide: true,
  },
];

interface KeypadProps {
  onAction: (action: Action) => void;
  disabled: boolean;
}

export function Keypad({ onAction, disabled }: KeypadProps) {
  return (
    <div className="keypad">
      {KEYS.map((key) => (
        <Key
          key={key.label}
          label={key.label}
          name={key.name}
          variant={key.variant}
          wide={key.wide}
          disabled={disabled && !key.alwaysEnabled}
          onPress={() => onAction(key.action)}
        />
      ))}
    </div>
  );
}
