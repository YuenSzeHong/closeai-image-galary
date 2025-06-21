// lib/translations/index.ts
import type { SupportedLocale, TranslationKeys } from "../i18n.ts";
import { zhCN } from "./zh-CN.ts";
import { en } from "./en.ts";
import { zhTW } from "./zh-TW.ts";

// Translation map
export const translations: Record<SupportedLocale, TranslationKeys> = {
  "zh-CN": zhCN,
  "en": en,
  "zh-TW": zhTW,
};

// Get translations for a specific locale
export function getTranslations(locale: SupportedLocale): TranslationKeys {
  return translations[locale] || translations["zh-CN"];
}

// Helper function to get nested translation value
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): string {
  return path.split(".").reduce((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown) as string || path;
}

// Translation function type
export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

// Create translation function for a specific locale
export function createTranslationFunction(
  locale: SupportedLocale,
): TranslateFn {
  const translations = getTranslations(locale);

  return (key: string, params?: Record<string, string | number>): string => {
    let value = getNestedValue(
      translations as unknown as Record<string, unknown>,
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
  };
}
