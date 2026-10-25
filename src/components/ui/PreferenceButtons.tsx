import { useTranslation } from 'react-i18next';
import { Accessibility, Volume2, VolumeX } from 'lucide-react';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import { sound } from '@/lib/sound';
import { cn } from '@/lib/cn';

interface PreferenceButtonsProps {
  inverted?: boolean;
  className?: string;
}

export function PreferenceButtons({ inverted = false, className }: PreferenceButtonsProps) {
  const { t } = useTranslation();
  const language = useSettingsStore((state) => state.language);
  const soundOn = useSettingsStore((state) => state.soundOn);
  const reduceMotion = useSettingsStore((state) => state.reduceMotion);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setSoundOn = useSettingsStore((state) => state.setSoundOn);
  const setReduceMotion = useSettingsStore((state) => state.setReduceMotion);

  const base = cn(
    'inline-flex h-9 items-center justify-center rounded-full border text-xs font-bold transition-all active:scale-95',
    inverted
      ? 'border-paper/20 text-paper/80 hover:bg-paper/10 hover:text-paper'
      : 'border-ink/10 text-ink-soft hover:bg-ink/5 hover:text-ink',
  );

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        className={cn(base, 'px-2.5 tracking-wide sm:px-3')}
        onClick={() => {
          setLanguage(language === 'bn' ? 'en' : 'bn');
          sound.play('click');
        }}
        aria-label={language === 'bn' ? 'Switch to English' : 'বাংলায় দেখাও'}
        title={t('common.language')}
      >
        {language === 'bn' ? 'বাং' : 'EN'}
        <span className="mx-1 hidden opacity-30 sm:inline">/</span>
        <span className="hidden opacity-45 sm:inline">{language === 'bn' ? 'EN' : 'বাং'}</span>
      </button>
      <button
        type="button"
        className={cn(base, 'w-9')}
        onClick={() => {
          const next = !soundOn;
          setSoundOn(next);
          if (next) {
            sound.setEnabled(true);
            window.setTimeout(() => sound.play('click'), 30);
          }
        }}
        aria-label={soundOn ? 'Mute sounds' : 'Turn sounds on'}
        aria-pressed={soundOn}
        title={t('common.sound')}
      >
        {soundOn ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
      </button>
      <button
        type="button"
        className={cn(
          base,
          'w-9',
          reduceMotion && (inverted ? 'bg-paper/15 text-paper' : 'bg-ink/10 text-ink'),
        )}
        onClick={() => {
          setReduceMotion(!reduceMotion);
          sound.play('click');
        }}
        aria-label={t('common.reducedMotion')}
        aria-pressed={reduceMotion}
        title={t('common.reducedMotion')}
      >
        <Accessibility className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
