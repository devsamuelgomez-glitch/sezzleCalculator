export type KeyVariant = 'digit' | 'operator' | 'function' | 'equals';

interface KeyProps {
  label: string;
  /** Accessible name when the visible label is a symbol. */
  name?: string;
  variant: KeyVariant;
  wide?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function Key({
  label,
  name,
  variant,
  wide = false,
  disabled = false,
  onPress,
}: KeyProps) {
  return (
    <button
      type="button"
      className={`key key--${variant}${wide ? ' key--wide' : ''}`}
      aria-label={name}
      disabled={disabled}
      onClick={onPress}
    >
      {label}
    </button>
  );
}
