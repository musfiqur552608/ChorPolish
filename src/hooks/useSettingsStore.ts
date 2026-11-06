import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { changeLanguage, storedLanguage, type Language } from '@/i18n';
import { sound } from '@/lib/sound';
import type { ThemeMode } from '@/lib/theme';

interface SettingsState {
  soundOn: boolean;
  reduceMotion: boolean;
  language: Language;
  theme: ThemeMode;
  setSoundOn: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  setLanguage: (value: Language) => void;
  setTheme: (value: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundOn: true,
      reduceMotion: false,
      language: storedLanguage(),
      theme: 'light',
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
    }),
    {
      name: 'chorpolice.settings',
      partialize: (state) => ({
        soundOn: state.soundOn,
        reduceMotion: state.reduceMotion,
        language: state.language,
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        sound.setEnabled(state.soundOn);
        changeLanguage(state.language);
      },
    },
  ),
);
