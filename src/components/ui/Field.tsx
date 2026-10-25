import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerClassName?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, leading, trailing, className, containerClassName, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-semibold text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-12 w-full rounded-[10px] border-2 border-ink/15 bg-paper-light px-4 text-ink placeholder:text-ink-faint',
            'shadow-[inset_0_2px_4px_rgba(32,51,70,.04)] transition-colors',
            'focus:border-teal focus:outline-none focus:ring-4 focus:ring-teal/10',
            leading && 'pl-10',
            trailing && 'pr-11',
            error && 'border-terracotta/70 focus:border-terracotta',
            className,
          )}
          {...props}
        />
        {trailing && <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-sm font-medium text-terracotta">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[13px] leading-snug text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
