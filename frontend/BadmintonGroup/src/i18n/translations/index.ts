import en from './translations/en';
import fr from './translations/fr';
import ko from './translations/ko';
import tl from './translations/tl';

export type Translation = typeof en;
export type Locale = 'en' | 'fr' | 'ko' | 'tl';

export const translations: Record<Locale, Translation> = { en, fr, ko, tl };

export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ko: '한국어',
  tl: 'Filipino',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  fr: '🇫🇷',
  ko: '🇰🇷',
  tl: '🇵🇭',
};
