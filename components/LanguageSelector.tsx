// components/LanguageSelector.tsx
import {
  i18nConfig as _i18nConfig,
  isValidLocale,
  localeNames,
} from "../lib/i18n.ts";
// Use new nanostores-based i18n
import {
  localeSignal,
  changeLocale,
  translateSignal,
} from "../lib/i18n-nanostores.ts";

interface LanguageSelectorProps {
  className?: string;
  showLabel?: boolean;
}

export default function LanguageSelector(
  { className = "", showLabel = true }: LanguageSelectorProps,
) {
  // Use new nanostores-based implementation
  const locale = localeSignal.value;
  const t = (key: string) => translateSignal(key);

  const setLocale = (newLocale: string) => {
    if (isValidLocale(newLocale)) {
      changeLocale(newLocale);
    }
  };

  const handleLocaleChange = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const newLocale = target.value;
    setLocale(newLocale);
  };

  return (
    <div class={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <label
          for="language-selector"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t("language.selectLanguage")}:
        </label>
      )}
      <select
        id="language-selector"
        value={locale}
        onChange={handleLocaleChange}
        class="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
        title={t("language.changeLanguage")}
      >
        {_i18nConfig.supportedLocales.map((supportedLocale) => (
          <option key={supportedLocale} value={supportedLocale}>
            {localeNames[supportedLocale]}
          </option>
        ))}
      </select>
    </div>
  );
}
