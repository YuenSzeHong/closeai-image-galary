// lib/i18n-nanostores.ts
// Simple signal-based i18n implementation

import { computed, signal } from "@preact/signals";
import type { SupportedLocale } from "./i18n.ts";
import { getStoredLocale, setStoredLocale } from "./i18n.ts";
import { translations } from "./translations/index.ts";

// Create locale signal
export const localeSignal = signal<SupportedLocale>(getStoredLocale());

// Computed signal for current translations
export const translationsSignal = computed(() => {
  return translations[localeSignal.value];
});

// Helper to change locale
export function changeLocale(newLocale: SupportedLocale) {
  // Update document language
  if (
    typeof globalThis !== "undefined" &&
    "document" in globalThis &&
    globalThis.document
  ) {
    (globalThis.document as Document).documentElement.lang = newLocale;
  }

  // Store in localStorage
  setStoredLocale(newLocale);

  // Update signal
  localeSignal.value = newLocale;

  // Dispatch event for backward compatibility
  if (typeof globalThis !== "undefined" && "dispatchEvent" in globalThis) {
    (globalThis as unknown as { dispatchEvent: (event: Event) => void })
      .dispatchEvent(
        new CustomEvent("localeChange", {
          detail: { locale: newLocale },
        }),
      );
  }
}

// Helper function to get nested translation value
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  return path.split(".").reduce((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown) as string || path;
}

// Translation function that uses signals
export function translateSignal(
  key: string,
  params?: Record<string, string | number>,
): string {
  const currentTranslations = translationsSignal.value;
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

// Alternative translation function name for compatibility
export const tSignal = translateSignal;
