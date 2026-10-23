import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { changeLanguage, storedLanguage, type Language } from '@/i18n';
import { sound } from '@/lib/sound';

interface SettingsState {
  soundOn: boolean;
  reduceMotion: boolean;
  language: Language;
  setSoundOn: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  setLanguage: (value: Language) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundOn: true,
      reduceMotion: false,
      language: storedLanguage(),
      setSoundOn: (value) => {
        sound.setEnabled(value);
        set({ soundOn: value });
      },
      setReduceMotion: (value) => set({ reduceMotion: value }),
      setLanguage: (value) => {
        changeLanguage(value);
        set({ language: value });
      },
    }),
    {
      name: 'chorpolice.settings',
      partialize: (state) => ({
        soundOn: state.soundOn,
        reduceMotion: state.reduceMotion,
        language: state.language,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        sound.setEnabled(state.soundOn);
        changeLanguage(state.language);
      },
    },
  ),
);
