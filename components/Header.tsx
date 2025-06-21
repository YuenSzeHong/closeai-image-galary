import ThemeToggle from "../islands/ThemeToggle.tsx";
import LanguageSelector from "./LanguageSelector.tsx";
import { useTranslation } from "../hooks/useTranslation.ts";

export default function Header() {
  const { t } = useTranslation();

  return (
    <header class="mb-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-3xl font-bold text-center text-gray-900 dark:text-white">
            {t("gallery.title")}
          </h1>{" "}
          <p class="text-center text-gray-600 dark:text-gray-400">
            {t("gallery.subtitle")}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <LanguageSelector showLabel={false} className="text-sm" />
          <ThemeToggle />
        </div>
      </div>{" "}
      <nav>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2 flex gap-1">
          <a
            href="/"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t("nav.gallery")}
          </a>{" "}
          <a
            href="/settings"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t("nav.settings")}
          </a>
          <a
            href="/about"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t("nav.about")}
          </a>
        </div>
      </nav>
    </header>
  );
}
