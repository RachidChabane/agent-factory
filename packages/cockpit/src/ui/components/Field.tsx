import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

interface FieldProps {
  readonly label: string;
  readonly hint?: ReactNode | undefined;
  readonly error?: string | null | undefined;
  readonly children: (id: string, describedBy: string | undefined) => ReactNode;
  readonly hideLabel?: boolean | undefined;
}

export function Field({ label, hint, error, children, hideLabel = false }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = hint === undefined && (error === undefined || error === null) ? undefined : hintId;
  return (
    <div className="ds-field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'ds-field__label'}>
        {label}
      </label>
      {children(id, describedBy)}
      {error !== undefined && error !== null ? (
        <p id={hintId} className="ds-field__error">
          {error}
        </p>
      ) : hint === undefined ? null : (
        <p id={hintId} className="ds-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={['ds-input', className].filter(Boolean).join(' ')} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={['ds-input', 'ds-textarea', className].filter(Boolean).join(' ')} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <span className="ds-select">
      <select ref={ref} className={['ds-input', className].filter(Boolean).join(' ')} {...rest}>
        {children}
      </select>
      <ChevronDown size={14} className="ds-select__chevron" aria-hidden="true" />
    </span>
  );
});

export function useFieldId(): string {
  return useId();
}
