import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface LoadingScreenProps {
  title: string;
  subtitle?: string;
  fullScreen?: boolean;
  dark?: boolean;
}

const roles = [
  { label: 'চোর', mark: '🥷', rotate: -10 },
  { label: 'পুলিশ', mark: '🕵️', rotate: 7 },
  { label: 'বাবু', mark: '🤴', rotate: -4 },
  { label: 'ডাকাত', mark: '🦹', rotate: 11 },
];

export function LoadingScreen({ title, subtitle, fullScreen = true, dark = false }: LoadingScreenProps) {
  return (
    <div
      className={cn(
        'grid place-items-center px-5',
        fullScreen ? 'fullscreen-fallback' : 'py-20',
        dark ? 'text-paper-light' : 'text-ink',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-7 h-20 w-32">
          {roles.map((role, index) => (
            <motion.div
              key={role.label}
              className="paper absolute left-1/2 top-1/2 grid h-[66px] w-[46px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-sm border border-ink/10 text-xl"
              style={{ rotate: role.rotate }}
              initial={{ opacity: 0, y: 18 }}
              animate={{
                opacity: 1,
                y: [12, -8, -18],
                x: (index - 1.5) * 26,
                rotate: [role.rotate, role.rotate + 3, role.rotate],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                repeatType: 'reverse',
                delay: index * 0.16,
                ease: 'easeInOut',
              }}
            >
              <span aria-hidden>{role.mark}</span>
            </motion.div>
          ))}
          <motion.span
            className="absolute bottom-0 left-1/2 h-1.5 w-24 -translate-x-1/2 rounded-full bg-ink/10 blur-[2px]"
            animate={{ scaleX: [0.8, 1.05, 0.8], opacity: [0.5, 0.2, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
        </div>
        <h2 className={cn('font-display text-xl font-bold', dark ? 'text-paper-light' : 'text-ink')}>{title}</h2>
        {subtitle && (
          <p className={cn('mt-1.5 max-w-xs text-sm', dark ? 'text-paper/85' : 'text-ink-soft')}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}
