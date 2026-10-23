import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX } from 'lucide-react';
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
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setSoundOn = useSettingsStore((state) => state.setSoundOn);

  const base = cn(
    'inline-flex h-9 items-center justify-center rounded-full border text-xs font-bold transition-colors',
    inverted
      ? 'border-paper/20 text-paper/80 hover:bg-paper/10 hover:text-paper'
      : 'border-ink/10 text-ink-soft hover:bg-ink/5 hover:text-ink',
  );

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        className={cn(base, 'px-3 tracking-wide')}
        onClick={() => setLanguage(language === 'bn' ? 'en' : 'bn')}
        aria-label={language === 'bn' ? 'Switch to English' : 'বাংলায় দেখাও'}
        title={t('common.language')}
      >
        {language === 'bn' ? 'বাং' : 'EN'}
        <span className="mx-1 opacity-30">/</span>
        <span className="opacity-45">{language === 'bn' ? 'EN' : 'বাং'}</span>
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
    </div>
  );
}
