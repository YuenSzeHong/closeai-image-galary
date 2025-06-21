// lib/i18n-provider.ts
import { signal } from "@preact/signals";
import type { SupportedLocale } from "./i18n.ts";
import { translations } from "./translations/index.ts";
import { getStoredLocale, setStoredLocale } from "./i18n.ts";

// Create a locale signal for reactive locale changes
export const localeAtom = signal<SupportedLocale>(getStoredLocale());

// Update locale and persist to storage
export const setLocale = (locale: SupportedLocale) => {
  localeAtom.value = locale;
  setStoredLocale(locale);

  // Update document language
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.document !== "undefined"
  ) {
    globalThis.document.documentElement.lang = locale;
  }

  // Dispatch event for components that need to react
  if (typeof globalThis !== "undefined" && "dispatchEvent" in globalThis) {
    globalThis.dispatchEvent(
      new CustomEvent("localeChange", {
        detail: { locale },
      }),
    );
  }
};

// Get current locale
export const getLocale = () => localeAtom.value;

// Helper function to get nested translation value
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  return path.split(".").reduce((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown) as string || path;
}

// Enhanced translation function using manual lookup for complex cases
export function translateWithI18n(
  locale: SupportedLocale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const currentTranslations = translations[locale];
  if (!currentTranslations) return key;

  let value = getNestedValue(
    currentTranslations as unknown as Record<string, unknown>,
    key,
  );

  // Handle interpolation
  if (params && typeof value === "string") {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      value = value.replace(
        new RegExp(`{{${paramKey}}}`, "g"),
        String(paramValue),
      );
    });
  }

  return value || key;
}

// Signal-aware translation function
export function translateWithSignals(
  key: string,
  params?: Record<string, string | number>,
): string {
  return translateWithI18n(localeAtom.value, key, params);
}

// Legacy compatibility - fallback translation using old method
export function translateWithI18nLegacy(
  locale: SupportedLocale,
  key: string,
  params?: Record<string, string | number>,
): string {
  try {
    // Fallback to manual translation lookup
    const currentTranslations = translations[locale];
    if (!currentTranslations) return key;

    let value = getNestedValue(
      currentTranslations as unknown as Record<string, unknown>,
      key,
    );

    // Handle interpolation
    if (params && typeof value === "string") {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        value = value.replace(
          new RegExp(`{{${paramKey}}}`, "g"),
          String(paramValue),
        );
      });
    }

    return value || key;
  } catch (error) {
    console.warn(
      `Translation missing for key: ${key} in locale: ${locale}`,
      error,
    );
    return key;
  }
}

// Pluralization support (basic implementation)
export function translatePluralWithI18n(
  locale: SupportedLocale,
  singular: string,
  plural: string,
  count: number,
  params?: Record<string, string | number>,
): string {
  try {
    const key = count === 1 ? singular : plural;
    return translateWithI18n(locale, key, { ...params, count });
  } catch (error) {
    console.warn(
      `Plural translation missing for: ${singular}/${plural} in locale: ${locale}`,
      error,
    );
    return count === 1 ? singular : plural;
  }
}

// Date formatting with i18n
export function formatDateWithI18n(
  locale: SupportedLocale,
  date: Date,
): string {
  try {
    return date.toLocaleDateString(locale);
  } catch (error) {
    console.warn(`Date formatting failed for locale: ${locale}`, error);
    return date.toLocaleDateString();
  }
}

// Number formatting with i18n
export function formatNumberWithI18n(
  locale: SupportedLocale,
  number: number,
): string {
  try {
    return number.toLocaleString(locale);
  } catch (error) {
    console.warn(`Number formatting failed for locale: ${locale}`, error);
    return number.toString();
  }
}
