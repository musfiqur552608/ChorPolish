import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import bn from './locales/bn';

export const LANG_STORAGE_KEY = 'chorpolice.language';
export type Language = 'bn' | 'en';

export function storedLanguage(): Language {
  if (typeof window === 'undefined') return 'bn';
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'bn';
  } catch {
    return 'bn';
  }
}

function applyDocumentLanguage(language: Language): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.classList.toggle('bn', language === 'bn');
}

void i18n.use(initReactI18next).init({
  resources: {
    bn: { translation: bn },
    en: { translation: en },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['bn', 'en'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function changeLanguage(language: Language): void {
  void i18n.changeLanguage(language);
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, language);
  } catch {
    // Private mode / storage blocked: the choice still applies for this visit.
  }
  applyDocumentLanguage(language);
}

applyDocumentLanguage(i18n.language === 'en' ? 'en' : 'bn');

export default i18n;
