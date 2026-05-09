import en from './en';
import fr from './fr';
import ko from './ko';
import tl from './tl';

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
