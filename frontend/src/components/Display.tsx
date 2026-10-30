interface DisplayProps {
  value: string;
  /** Pending expression such as "2 +", shown above the value. */
  expression: string;
  error: string | null;
  busy: boolean;
}

export function Display({ value, expression, error, busy }: DisplayProps) {
  return (
    <section className="display" aria-label="Display" aria-busy={busy}>
      <div className="display__banner">
        {error !== null && (
          <p className="display__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <p className="display__expression" aria-hidden="true">
        {expression}
      </p>
      <p
        className="display__value"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-busy={busy}
      >
        {value}
      </p>
    </section>
  );
}
