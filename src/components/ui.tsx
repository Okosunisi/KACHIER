import { useEffect, useId, useRef } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';

/** Keeps only digits and a single decimal point. */
export function cleanNumber(v: string): string {
  let out = '';
  let dot = false;
  for (const ch of v) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !dot) {
      dot = true;
      out += ch;
    }
  }
  return out;
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

function FieldShell({ label, error, hint, required, id, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="err" id={`${id}-e`}>
          {error}
        </p>
      ) : hint ? (
        <p className="hint" id={`${id}-h`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = FieldProps & {
  value: string;
  onChange: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

export function Input({ label, error, hint, required, value, onChange, ...rest }: InputProps) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} id={id}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function NumInput(props: InputProps) {
  const { onChange, ...rest } = props;
  return <Input {...rest} onChange={(v) => onChange(cleanNumber(v))} type="text" inputMode="decimal" autoComplete="off" />;
}

type TextareaProps = FieldProps & {
  value: string;
  onChange: (v: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

export function Textarea({ label, error, hint, required, value, onChange, rows = 3, ...rest }: TextareaProps) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} id={id}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  error,
  hint,
}: FieldProps & { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} id={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? ' small' : ''}`}>
      <img className="brand-logo" src="/kachier-logo.png" alt="KACHIER" width={180} height={30} />
    </span>
  );
}
