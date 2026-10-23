import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import bn from './locales/bn';

export const LANG_STORAGE_KEY = 'chorpolice.language';
export type Language = 'bn' | 'en';

export function storedLanguage(): Language {
  if (typeof window === 'undefined') return 'bn';
  return window.localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'bn';
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
  window.localStorage.setItem(LANG_STORAGE_KEY, language);
  document.documentElement.lang = language;
  document.documentElement.classList.toggle('bn', language === 'bn');
}

document.documentElement.lang = i18n.language;
document.documentElement.classList.toggle('bn', i18n.language === 'bn');

export default i18n;
