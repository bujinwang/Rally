import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations, localeNames, Locale } from './translations';
import type { Translation } from './translations';

type LanguageContextType = {
  t: Translation;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  localeName: string;
  availableLocales: { code: Locale; name: string }[];
};

const LanguageContext = createContext<LanguageContextType>({
  t: translations.en,
  locale: 'en',
  setLocale: () => {},
  localeName: 'English',
  availableLocales: [],
});

export const useTranslation = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    // Detect language from browser/system
    const detect = () => {
      let lang = 'en';
      if (typeof window !== 'undefined' && window.navigator) {
        const nav = window.navigator.language || (window.navigator as any).userLanguage || '';
        if (nav.startsWith('fr')) lang = 'fr';
        else if (nav.startsWith('ko')) lang = 'ko';
        else if (nav.startsWith('tl') || nav.startsWith('fil')) lang = 'tl';
      }
      try {
        const stored = localStorage.getItem('badminton-locale');
        if (stored && ['en', 'fr', 'ko', 'tl'].includes(stored)) lang = stored;
      } catch {}
      setLocaleState(lang as Locale);
    };
    detect();
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try { localStorage.setItem('badminton-locale', newLocale); } catch {}
  }, []);

  const availableLocales = Object.entries(localeNames).map(([code, name]) => ({
    code: code as Locale,
    name,
  }));

  return (
    <LanguageContext.Provider value={{
      t: translations[locale],
      locale,
      setLocale,
      localeName: localeNames[locale],
      availableLocales,
    }}>
      {children}
    </LanguageContext.Provider>
  );
};
