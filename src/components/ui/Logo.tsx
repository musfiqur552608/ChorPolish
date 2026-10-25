import { cn } from '@/lib/cn';

export function PoliceCap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className={className}>
      <path
        d="M10.5 39.5c2.7 7.7 10.8 12 21.5 12s18.8-4.3 21.5-12l-4.2-2.6c-3.3 3-9.3 4.8-17.3 4.8s-14-1.8-17.3-4.8l-4.2 2.6Z"
        fill="#203346"
      />
      <path
        d="M16.5 37.6h31c-.2-4.9-2.1-8.6-4.4-9.4-3.2-1.2-7.4 1.8-11.1 1.8s-7.9-3-11.1-1.8c-2.3.8-4.2 4.5-4.4 9.4Z"
        fill="#203346"
      />
      <path
        d="M16 38.3c0 2.7 7.3 4.6 16 4.6s16-1.9 16-4.6"
        stroke="#dfa93f"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M32 21.5v7M28.5 24.8h7"
        stroke="#dfa93f"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="32" cy="30.5" r="2.3" fill="#dfa93f" />
      <path
        d="M27.2 11.5c1.1-4 8.5-4 9.6 0"
        stroke="#b84b3d"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity=".8"
      />
      <path d="M42 17.5c2.5-2.2 4.6-1.8 6 .8" stroke="#dfa93f" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface LogoProps {
  compact?: boolean;
  inverted?: boolean;
  className?: string;
}

export function Logo({ compact = false, inverted = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-2.5', className)}>
      <span
        className={cn(
          'relative grid place-items-center rounded-[10px] border-2 shadow-[0_2px_0_rgba(32,51,70,.2)]',
          inverted ? 'border-paper/30 bg-paper' : 'border-ink/15 bg-paper-light',
          compact ? 'h-10 w-10' : 'h-11 w-11 rotate-[-3deg]',
        )}
      >
        <PoliceCap className={compact ? 'h-7 w-7' : 'h-8 w-8'} />
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-ink/20 bg-mustard" />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'whitespace-nowrap font-display font-bold tracking-tight',
            inverted ? 'text-paper-light' : 'text-ink',
            compact ? 'text-[22px]' : 'text-2xl',
          )}
        >
          চোর পুলিশ
        </span>
        {!compact && (
          <span
            className={cn(
              'mt-1 whitespace-nowrap font-hand text-[14px] font-semibold tracking-[0.18em]',
              inverted ? 'text-paper/85' : 'text-ink-soft',
            )}
          >
            CHOR POLICE
          </span>
        )}
      </span>
    </span>
  );
}
