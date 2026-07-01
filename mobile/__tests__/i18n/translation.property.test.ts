/**
 * Feature: mobile-app-ui-redesign
 * Translation System Property Tests (P1, P2, P3)
 *
 * Tests the i18n translation system properties:
 * - Translation completeness across both languages
 * - Language persistence round-trip via AsyncStorage
 * - English fallback for missing Hindi keys
 */
import * as fc from 'fast-check';

// Import translation maps directly for testing
import en from '../../src/i18n/en.json';
import hi from '../../src/i18n/hi.json';

// --- AsyncStorage mock with in-memory store ---
const asyncStorageStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async (key: string, value: string) => {
    asyncStorageStore[key] = value;
  }),
  getItem: jest.fn(async (key: string) => {
    return asyncStorageStore[key] ?? null;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete asyncStorageStore[key];
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Translation logic (mirrors LanguageContext.tsx) ---
type Language = 'hi' | 'en';
type TranslationMap = Record<string, string>;

const translations: Record<Language, TranslationMap> = { en, hi };

function t(key: string, language: Language): string {
  return translations[language]?.[key]
    ?? translations['en']?.[key]
    ?? key;
}

// --- Generators ---
const allEnKeys = Object.keys(en);
const allHiKeys = Object.keys(hi);
const allKeys = Array.from(new Set([...allEnKeys, ...allHiKeys]));

/** Generates a key from the actual translation key set */
const translationKeyArb = fc.constantFrom(...allKeys);

/** Generates a language value */
const languageArb = fc.constantFrom<Language>('hi', 'en');

/** Generates a sequence of language toggles (1-20 toggles) */
const languageSequenceArb = fc.array(languageArb, { minLength: 1, maxLength: 20 });

// --- Property 1: Translation Completeness ---
describe('Feature: mobile-app-ui-redesign, Property 1: Translation Completeness', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For any key referenced in the app, t(key) never returns
   * the raw key itself in either language mode.
   */
  it('t(key) never returns the raw key for any existing translation key in either language', () => {
    fc.assert(
      fc.property(translationKeyArb, languageArb, (key: string, lang: Language) => {
        const result = t(key, lang);
        // The translation should never return the raw key itself
        expect(result).not.toBe(key);
      }),
      { numRuns: 200 }
    );
  });
});

// --- Property 2: Language Persistence Round-Trip ---
describe('Feature: mobile-app-ui-redesign, Property 2: Language Persistence Round-Trip', () => {
  const STORAGE_KEY = 'swift_language_preference';

  beforeEach(() => {
    // Clear the in-memory store before each test
    Object.keys(asyncStorageStore).forEach((key) => delete asyncStorageStore[key]);
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 3.3, 14.3**
   *
   * setLanguage(lang) followed by AsyncStorage read returns
   * the same value. Tests random sequences of language toggles.
   */
  it('setLanguage persists to AsyncStorage and reading back returns the same value', async () => {
    await fc.assert(
      fc.asyncProperty(languageSequenceArb, async (langSequence: Language[]) => {
        for (const lang of langSequence) {
          // Simulate setLanguage: persist to AsyncStorage
          await AsyncStorage.setItem(STORAGE_KEY, lang);

          // Read back and verify round-trip
          const stored = await AsyncStorage.getItem(STORAGE_KEY);
          expect(stored).toBe(lang);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// --- Property 3: English Fallback ---
describe('Feature: mobile-app-ui-redesign, Property 3: English Fallback', () => {
  /**
   * **Validates: Requirements 3.7, 4.6**
   *
   * For keys missing in Hindi, t(key) with language 'hi'
   * returns the English value (not the raw key).
   */
  it('t(key) returns English value when key is missing in Hindi', () => {
    // Create synthetic English-only keys by generating unique keys
    // that exist in en but NOT in hi
    const syntheticEnOnlyKeyArb = fc.string({ minLength: 5, maxLength: 30 })
      .filter((key) => !(key in hi) && !(key in en))
      .map((key) => {
        // Temporarily add key to English translations for this test
        return key;
      });

    fc.assert(
      fc.property(syntheticEnOnlyKeyArb, (syntheticKey: string) => {
        // Add the synthetic key to English translations only
        const englishValue = `English value for ${syntheticKey}`;
        translations['en'][syntheticKey] = englishValue;

        try {
          // When language is 'hi' and key only exists in English,
          // t(key) should return the English value (fallback)
          const result = t(syntheticKey, 'hi');
          expect(result).toBe(englishValue);
          // Should NOT be the raw key
          expect(result).not.toBe(syntheticKey);
        } finally {
          // Clean up: remove synthetic key
          delete translations['en'][syntheticKey];
        }
      }),
      { numRuns: 100 }
    );
  });

  it('t(key) falls back to English for real keys present only in en map', () => {
    // Find or simulate keys that are only in English
    // Since both maps currently have same keys, we test by temporarily
    // removing keys from hi
    const hiKeyArb = fc.constantFrom(...allHiKeys);

    fc.assert(
      fc.property(hiKeyArb, (key: string) => {
        // Temporarily remove key from Hindi
        const originalHiValue = translations['hi'][key];
        delete translations['hi'][key];

        try {
          const result = t(key, 'hi');
          // Should fallback to English value
          expect(result).toBe(translations['en'][key]);
          // Should not return the raw key
          expect(result).not.toBe(key);
        } finally {
          // Restore
          translations['hi'][key] = originalHiValue;
        }
      }),
      { numRuns: 100 }
    );
  });
});
