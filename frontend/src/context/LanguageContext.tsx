'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations, Translations } from '../lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('tr');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('market_pulse_lang');
        if (saved === 'en' || saved === 'tr') {
          setLanguageState(saved);
        }
      } catch (e) {
        // Ignore localStorage error
      }
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('market_pulse_lang', lang);
      } catch (e) {
        // Ignore
      }
    }
  };

  const toggleLanguage = () => {
    const next: Language = language === 'tr' ? 'en' : 'tr';
    setLanguage(next);
  };

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      language: 'tr',
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: translations['tr'],
    };
  }
  return context;
}
