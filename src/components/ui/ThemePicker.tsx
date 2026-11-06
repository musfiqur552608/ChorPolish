import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Moon, Monitor, Sun } from 'lucide-react';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import type { ThemeMode } from '@/lib/theme';
import { sound } from '@/lib/sound';
import { cn } from '@/lib/cn';

const MODES: Array<{ id: ThemeMode; icon: typeof Sun; labelKey: string }> = [
  { id: 'light', icon: Sun, labelKey: 'common.themeLight' },
  { id: 'system', icon: Monitor, labelKey: 'common.themeSystem' },
  { id: 'dark', icon: Moon, labelKey: 'common.themeDark' },
];

interface ThemePickerProps {
  inverted?: boolean;
  className?: string;
  align?: 'end' | 'start';
}

export function ThemePicker({ inverted = false, className, align = 'end' }: ThemePickerProps) {
  const { t } = useTranslation();
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const isDark = theme === 'dark';

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const ModeIcon = isDark ? Moon : Sun;

  const base = cn(
    'inline-flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition-all active:scale-95',
    inverted
      ? 'border-paper/20 text-paper/80 hover:bg-paper/10 hover:text-paper'
      : 'border-ink/10 text-ink-soft hover:bg-ink/5 hover:text-ink',
  );

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        className={base}
        onClick={() => {
          setOpen((value) => !value);
          sound.play('click');
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('common.appearance')}
        title={t('common.appearance')}
      >
        <ModeIcon className="h-4 w-4" aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={t('common.appearance')}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={cn(
              'premium-glass scrollbar-paper fixed inset-x-4 top-16 z-[70] max-h-[82vh] overflow-y-auto rounded-2xl border border-ink/10 p-4 shadow-paper-lift',
              'sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[280px] sm:max-h-none',
              align === 'start' && 'sm:left-0 sm:right-auto',
            )}
          >
            <p className="font-hand text-lg font-bold leading-none text-ink">{t('common.appearance')}</p>

            <div
              role="radiogroup"
              aria-label={t('common.appearance')}
              className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-ink/10 bg-paper-deep/30 p-1"
            >
              {MODES.map((mode) => {
                const selected = theme === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setTheme(mode.id);
                      sound.play(mode.id === 'dark' ? 'peek' : 'click');
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-bold transition-all',
                      selected
                        ? 'bg-paper-light text-ink shadow-sm ring-1 ring-ink/15'
                        : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    <mode.icon className="h-4 w-4" aria-hidden />
                    {t(mode.labelKey)}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => sound.play('sparkle')}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-paper-light px-3 text-xs font-bold text-ink-soft transition-all hover:bg-ink/5 hover:text-ink"
              >
                🔊 {t('common.sound')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
