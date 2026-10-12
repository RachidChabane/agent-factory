import type { ReactNode } from 'react';
import { Field, TextInput } from '../../ui/components/Field.tsx';

interface NumberFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** The keyboard a phone offers: digits with a decimal mark, or digits only. */
  readonly inputMode: 'decimal' | 'numeric';
  readonly hint?: ReactNode | undefined;
  readonly error?: string | null | undefined;
  readonly placeholder?: string | undefined;
}

/** A number typed as text, so that what the operator wrote is checked and never silently turned into something else. */
export function NumberField({ label, value, onChange, inputMode, hint, error, placeholder }: NumberFieldProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <TextInput
          id={id}
          className="num"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={error === null || error === undefined ? undefined : true}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </Field>
  );
}
