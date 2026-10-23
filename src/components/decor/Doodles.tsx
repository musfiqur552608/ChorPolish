import { cn } from '@/lib/cn';

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('h-5 w-5', className)} aria-hidden>
      <path
        d="M12 2.5c.8 5.7 3 8 8.5 9-5.5 1-7.7 3.4-8.5 9-.8-5.6-3-8-8.5-9 5.5-1 7.7-3.3 8.5-9Z"
        fill="currentColor"
        opacity=".9"
      />
    </svg>
  );
}

export function TinyStarCrown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 30" fill="none" className={cn('h-6 w-10', className)} aria-hidden>
      <path
        d="M4 24 8 8l7 8 7-13 7 13 7-8 4 16H4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M7 25.5c9-1.3 21-1.3 30 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function LoopyArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 100" fill="none" className={cn('h-24 w-36', className)} aria-hidden>
      <path
        d="M8 76c6-35 29-57 58-54 24 3 31 24 13 32-22 10-36-18-9-37 20-14 43-8 55 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 6"
      />
      <path
        d="m117 12 11 11-15 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MagnifierDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 70 70" fill="none" className={cn('h-16 w-16', className)} aria-hidden>
      <circle cx="29" cy="28" r="17" stroke="currentColor" strokeWidth="3" />
      <circle cx="29" cy="28" r="11.5" stroke="currentColor" strokeWidth="1" opacity=".35" />
      <path d="m42 42 15 17" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M18 20c3-5 8-8 14-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

export function FootprintsDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 90" fill="currentColor" className={cn('h-20 w-16', className)} aria-hidden>
      <g opacity=".26">
        <ellipse cx="24" cy="24" rx="8" ry="13" transform="rotate(-15 24 24)" />
        <circle cx="15" cy="9" r="3.5" />
        <circle cx="22" cy="7" r="3.9" />
        <circle cx="29" cy="8" r="3.5" />
        <ellipse cx="52" cy="57" rx="8" ry="13" transform="rotate(12 52 57)" />
        <circle cx="44" cy="43" r="3.5" />
        <circle cx="51" cy="41" r="3.9" />
        <circle cx="58" cy="42" r="3.5" />
      </g>
    </svg>
  );
}

export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 18" fill="none" className={cn('h-4 w-32', className)} aria-hidden>
      <path
        d="M2 12c12-8 19 4 31-2s20 3 31-2 20 3 31-2 22 5 43-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CircleScribble({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 80" fill="none" className={cn('h-20 w-40', className)} aria-hidden>
      <path
        d="M31 51c-8-20 18-38 51-37s61 19 49 35c-9 12-39 19-69 15C34 60 24 48 36 35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".65"
      />
    </svg>
  );
}
