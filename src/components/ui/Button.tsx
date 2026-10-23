import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'paper';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'border-ink bg-ink text-paper-light shadow-[0_4px_0_#b84b3d] hover:bg-[#2b4359] hover:shadow-[0_5px_0_#b84b3d] active:shadow-[0_1px_0_#b84b3d] disabled:shadow-[0_3px_0_#a9937d]',
  secondary:
    'border-ink/20 bg-paper-light text-ink shadow-[0_3px_0_rgba(32,51,70,.16)] hover:border-ink/35 hover:bg-white active:shadow-none',
  accent:
    'border-ink bg-mustard text-ink shadow-[0_4px_0_#203346] hover:bg-[#e7b651] active:shadow-[0_1px_0_#203346]',
  danger:
    'border-terracotta bg-terracotta text-white shadow-[0_4px_0_#792d25] hover:bg-[#a64034] active:shadow-none',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-ink/5',
  paper:
    'border-ink/15 bg-[#fffdf6] text-ink shadow-[0_3px_0_rgba(32,51,70,.13)] hover:border-ink/30 active:shadow-none',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-10 px-3.5 py-2 text-sm gap-1.5 rounded-lg',
  md: 'min-h-12 px-5 py-2.5 text-[15px] gap-2 rounded-[10px]',
  lg: 'min-h-14 px-6 py-3 text-base gap-2.5 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'btn-press inline-flex select-none items-center justify-center border-2 font-semibold leading-tight',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-[1.15em] w-[1.15em] shrink-0 animate-spin" aria-hidden />
      ) : (
        leftIcon
      )}
      <span className="truncate">{children}</span>
      {!loading && rightIcon}
    </button>
  );
});
