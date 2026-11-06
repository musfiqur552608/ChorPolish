import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { changeLanguage, storedLanguage, type Language } from '@/i18n';
import { sound } from '@/lib/sound';
import { DEFAULT_PAPER_COLOR, normalizeHex, type PaperPresetId, type ThemeMode } from '@/lib/theme';

interface SettingsState {
  soundOn: boolean;
  reduceMotion: boolean;
  language: Language;
  theme: ThemeMode;
  paperPreset: PaperPresetId;
  paperColor: string;
  setSoundOn: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  setLanguage: (value: Language) => void;
  setTheme: (value: ThemeMode) => void;
  setPaperPreset: (value: PaperPresetId) => void;
  setPaperColor: (value: string) => void;
  setCustomPaper: (value: string) => void;
  resetPaper: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundOn: true,
      reduceMotion: false,
      language: storedLanguage(),
      theme: 'light',
      paperPreset: 'cream',
      paperColor: DEFAULT_PAPER_COLOR,
      setSoundOn: (value) => {
        sound.setEnabled(value);
        set({ soundOn: value });
      },
      setReduceMotion: (value) => set({ reduceMotion: value }),
      setLanguage: (value) => {
        changeLanguage(value);
        set({ language: value });
      },
      setTheme: (value) => set({ theme: value }),
      setPaperPreset: (value) => set({ paperPreset: value }),
      setPaperColor: (value) => set({ paperColor: normalizeHex(value) }),
      setCustomPaper: (value) => {
        set({ paperPreset: 'custom', paperColor: normalizeHex(value) });
      },
      resetPaper: () => set({ paperPreset: 'cream', paperColor: DEFAULT_PAPER_COLOR }),
    }),
    {
      name: 'chorpolice.settings',
      partialize: (state) => ({
        soundOn: state.soundOn,
        reduceMotion: state.reduceMotion,
        language: state.language,
        theme: state.theme,
        paperPreset: state.paperPreset,
        paperColor: state.paperColor,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        sound.setEnabled(state.soundOn);
        changeLanguage(state.language);
      },
    },
  ),
);
