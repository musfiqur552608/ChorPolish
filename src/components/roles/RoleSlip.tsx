import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import type { Role } from '@/types';

export const ROLE_EMOJI: Record<Role, string> = {
  BABU: '🤴',
  POLICE: '🕵️',
  CHOR: '🥷',
  DAKAT: '🦹',
};

export const ROLE_INK: Record<Role, string> = {
  BABU: 'bg-[#f7e3ab] text-[#6a4a0d]',
  POLICE: 'bg-[#dbeaf0] text-[#214858]',
  CHOR: 'bg-[#f1dcd8] text-[#742f28]',
  DAKAT: 'bg-[#e2dfeb] text-[#37304d]',
};

const sizes = {
  xs: {
    card: 'h-[46px] w-[34px] rounded-[3px]',
    emoji: 'text-base',
    title: 'text-[10px]',
    points: 'text-[13px]',
    fold: 'h-2 w-2',
  },
  sm: {
    card: 'h-[68px] w-[50px] rounded-[4px]',
    emoji: 'text-xl',
    title: 'text-[11px]',
    points: 'text-[15px]',
    fold: 'h-2.5 w-2.5',
  },
  md: {
    card: 'h-[110px] w-[80px] rounded-[5px]',
    emoji: 'text-3xl',
    title: 'text-sm',
    points: 'text-xl',
    fold: 'h-3.5 w-3.5',
  },
  lg: {
    card: 'h-[158px] w-[118px] rounded-[6px]',
    emoji: 'text-5xl',
    title: 'text-base',
    points: 'text-2xl',
    fold: 'h-4 w-4',
  },
  hero: {
    card: 'h-[190px] w-[142px] rounded-[7px]',
    emoji: 'text-6xl',
    title: 'text-lg',
    points: 'text-3xl',
    fold: 'h-5 w-5',
  },
} as const;

interface RoleSlipProps {
  role?: Role | null;
  size?: keyof typeof sizes;
  className?: string;
  faceDown?: boolean;
  onClick?: () => void;
  interactive?: boolean;
  showBrand?: boolean;
  animateIn?: boolean;
  ariaLabel?: string;
}

export function RoleSlip({
  role = null,
  size = 'md',
  className,
  faceDown = false,
  onClick,
  interactive = false,
  showBrand = true,
  animateIn = false,
  ariaLabel,
}: RoleSlipProps) {
  const { t } = useTranslation();
  const styling = sizes[size];
  const isHidden = faceDown || !role;
  const Component = interactive || onClick ? motion.button : motion.div;

  return (
    <Component
      type={interactive || onClick ? 'button' : undefined}
      onClick={onClick}
      whileHover={interactive ? { y: -3, rotate: 1.5 } : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      initial={animateIn ? { opacity: 0, y: 14, rotate: -4 } : false}
      animate={animateIn ? { opacity: 1, y: 0, rotate: 0 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      aria-label={ariaLabel ?? (role ? t(`roles.${role}.name`) : t('game.tapToPeek'))}
      disabled={interactive && !onClick ? true : undefined}
      className={cn(
        'paper relative shrink-0 select-none border border-ink/10 text-left shadow-paper',
        styling.card,
        interactive && 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mustard',
        isHidden ? 'bg-[#f5ebd6]' : '',
        className,
      )}
    >
      <span
        className={cn(
          'absolute right-0 top-0 border-b border-l border-ink/10 bg-white/35',
          styling.fold,
        )}
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }}
        aria-hidden
      />
      {isHidden ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
          <span
            className={cn(
              'font-hand font-bold text-ink/35',
              size === 'hero' ? 'text-6xl' : size === 'lg' ? 'text-5xl' : size === 'md' ? 'text-4xl' : 'text-2xl',
            )}
            aria-hidden
          >
            ?
          </span>
          {showBrand && size !== 'xs' && (
            <span
              className={cn(
                'stamp scale-75 font-bangla text-[7px] opacity-40',
                size === 'sm' && 'hidden',
              )}
            >
              চোর পুলিশ
            </span>
          )}
        </span>
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center px-1.5 pb-1 text-center">
          <span
            className={cn(
              'grid place-items-center rounded-full leading-none',
              styling.emoji,
              size === 'hero' && '-mt-1',
            )}
            aria-hidden
          >
            {ROLE_EMOJI[role]}
          </span>
          <span
            className={cn(
              'mt-0.5 font-bangla font-bold leading-tight text-ink',
              styling.title,
              size === 'xs' && 'mt-0',
            )}
          >
            {t(`roles.${role}.name`)}
          </span>
          <span
            className={cn(
              'font-hand font-bold leading-none text-terracotta',
              styling.points,
              size === 'xs' && 'mt-0.5',
            )}
          >
            {t(`roles.${role}.points`)}
          </span>
        </span>
      )}
    </Component>
  );
}

export function RoleBadge({
  role,
  className,
  showName = true,
  size = 'sm',
}: {
  role: Role;
  className?: string;
  showName?: boolean;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-ink/10 font-semibold leading-none text-ink',
        ROLE_INK[role],
        size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-sm',
        className,
      )}
    >
      <span aria-hidden>{ROLE_EMOJI[role]}</span>
      {showName && <span>{t(`roles.${role}.name`)}</span>}
    </span>
  );
}
