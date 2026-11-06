import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check, Moon, Palette, Sun, Monitor, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import { PAPER_PRESETS, normalizeHex, type ThemeMode } from '@/lib/theme';
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
  const paperPreset = useSettingsStore((state) => state.paperPreset);
  const paperColor = useSettingsStore((state) => state.paperColor);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setPaperPreset = useSettingsStore((state) => state.setPaperPreset);
  const setCustomPaper = useSettingsStore((state) => state.setCustomPaper);
  const resetPaper = useSettingsStore((state) => state.resetPaper);

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
        <Palette className="h-4 w-4" aria-hidden />
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
              'paper scrollbar-paper fixed inset-x-4 top-16 z-[70] max-h-[82vh] overflow-y-auto rounded-2xl border border-ink/10 p-4 shadow-paper-lift',
              'sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[300px] sm:max-h-none',
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
                      sound.play('click');
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

            <p className="mt-4 text-sm font-bold text-ink">{t('common.paperColor')}</p>
            <div className="mt-2 grid grid-cols-7 gap-1.5" role="radiogroup" aria-label={t('common.paperColor')}>
              {PAPER_PRESETS.map((preset) => {
                const selected = paperPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setPaperPreset(preset.id);
                      sound.play('click');
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-[10px] leading-tight transition-all',
                      selected ? 'bg-paper-light text-ink shadow-sm ring-1 ring-ink/20' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    <span
                      className="relative grid h-8 w-8 place-items-center rounded-full border border-ink/15 shadow-sm"
                      style={{ backgroundColor: preset.color }}
                      aria-hidden
                    >
                      {selected && <Check className="h-4 w-4 text-[#203346]" aria-hidden />}
                    </span>
                    <span className="max-w-full truncate">{preset.labelBn}</span>
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={paperPreset === 'custom'}
                onClick={() => {
                  setCustomPaper(paperColor);
                  sound.play('click');
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-[10px] leading-tight transition-all',
                  paperPreset === 'custom'
                    ? 'bg-paper-light text-ink shadow-sm ring-1 ring-ink/20'
                    : 'text-ink-soft hover:text-ink',
                )}
              >
                <span
                  className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-ink/15 shadow-sm"
                  aria-hidden
                >
                  <span
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(135deg,#f8d7da 0%,#f7e3ab 25%,#c9e7d0 50%,#dbeaf0 75%,#e2dfeb 100%)',
                    }}
                  />
                  <span className="relative grid h-6 w-6 place-items-center rounded-full bg-black/25 text-white">
                    <Palette className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </span>
                <span className="max-w-full truncate">{t('common.customPaper')}</span>
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label
                className={cn(
                  'relative flex h-11 flex-1 cursor-pointer items-center gap-2 overflow-hidden rounded-xl border-2 border-dashed px-3 text-sm font-bold text-ink',
                  paperPreset === 'custom' ? 'border-ink/40 bg-paper-light' : 'border-ink/20 bg-paper-deep/20',
                )}
                title={t('common.customPaper')}
              >
                <input
                  type="color"
                  value={normalizeHex(paperColor)}
                  onChange={(event) => setCustomPaper(event.target.value)}
                  onClick={() => sound.play('click')}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={t('common.customPaper')}
                />
                <span
                  className="h-5 w-5 shrink-0 rounded-full border border-ink/20 shadow-sm"
                  style={{ backgroundColor: normalizeHex(paperColor) }}
                  aria-hidden
                />
                <span className="font-mono text-xs uppercase tracking-wider">{normalizeHex(paperColor)}</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  resetPaper();
                  sound.play('flip');
                }}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-ink/15 px-3 text-xs font-bold text-ink-soft transition-all hover:bg-ink/5 hover:text-ink"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {t('common.resetPaper')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
