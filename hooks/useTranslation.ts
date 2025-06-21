// hooks/useTranslation.ts
import { useEffect } from "preact/hooks";
import type { SupportedLocale } from "../lib/i18n.ts";
import { i18nConfig } from "../lib/i18n.ts";
import {
  createTranslationFunction,
  type TranslateFn,
} from "../lib/translations/index.ts";
import {
  localeAtom,
  setLocale as setGlobalLocale,
  translateWithSignals,
} from "../lib/i18n-provider.ts";

export interface UseTranslationResult {
  t: TranslateFn;
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  supportedLocales: SupportedLocale[];
  // Enhanced i18n functions
  tI18n: (key: string, params?: Record<string, string | number>) => string;
}

export function useTranslation(): UseTranslationResult {
  const locale = localeAtom.value;

  const setLocale = (newLocale: SupportedLocale) => {
    setGlobalLocale(newLocale);
  };

  useEffect(() => {
    // Listen for locale changes from other components
    const handleLocaleChange = (event: CustomEvent) => {
      const newLocale = event.detail?.locale;
      if (newLocale && newLocale !== locale) {
        setGlobalLocale(newLocale);
      }
    };

    if (typeof globalThis !== "undefined" && "addEventListener" in globalThis) {
      globalThis.addEventListener(
        "localeChange",
        handleLocaleChange as EventListener,
      );

      return () => {
        globalThis.removeEventListener(
          "localeChange",
          handleLocaleChange as EventListener,
        );
      };
    }
  }, []);

  // Standard translation function (existing) - for compatibility
  const t = createTranslationFunction(locale);

  // Enhanced translation function using signals
  const tI18n = (key: string, params?: Record<string, string | number>) => {
    return translateWithSignals(key, params);
  };

  return {
    t,
    locale,
    setLocale,
    supportedLocales: i18nConfig.supportedLocales,
    tI18n,
  };
}
