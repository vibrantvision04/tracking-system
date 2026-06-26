import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en.json';
import hi from './hi.json';

type Language = 'hi' | 'en';
type TranslationMap = Record<string, string>;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, TranslationMap> = { en, hi };
const STORAGE_KEY = 'iswm_language_preference';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('hi');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function loadLanguage() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'hi') {
          setLanguageState(stored);
        }
      } catch {
        // Default to Hindi if read fails
      } finally {
        setIsReady(true);
      }
    }
    loadLanguage();
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {
      // Persist failure is non-blocking; language still applies for session
    });
  }, []);

  const t = useCallback((key: string): string => {
    return translations[language]?.[key]
      ?? translations['en']?.[key]
      ?? key;
  }, [language]);

  if (!isReady) return null;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
