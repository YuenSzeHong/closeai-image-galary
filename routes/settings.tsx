import { Head } from "$fresh/runtime.ts";
import Header from "../components/Header.tsx";
import SettingsForm from "../islands/SettingsForm.tsx";
import ZipExport from "../islands/ZipExport.tsx";
import { useTranslation } from "../hooks/useTranslation.ts";

export default function Settings() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("meta.settingsTitle")}</title>
        <meta name="description" content={t("meta.settingsDescription")} />
      </Head>

      <div class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-300 min-h-screen">
        <div class="max-w-6xl mx-auto px-4 py-6">
          <Header />

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
              {t("settings.title")}
            </h2>

            <div
              id="errorMessage"
              class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 p-4 rounded mb-4 hidden"
            >
            </div>

            <SettingsForm /> {/* ZIP Export Section */}
            <div
              id="export"
              class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700"
            >
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                {t("export.title")}
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {t("export.description")}
              </p>
              <ZipExport />
            </div>

            {/* Database Management Section */}
            <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                {t("settings.localStorageManagement")}
              </h3>
              <div class="flex gap-2 mb-4">
                <button
                  type="button"
                  id="clearCurrentTeamBtn"
                  class="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors text-sm"
                >
                  {t("settings.clearCurrentWorkspace")}
                </button>
                <button
                  type="button"
                  id="clearAllDataBtn"
                  class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors text-sm"
                >
                  {t("settings.clearAllData")}
                </button>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {t("settings.imagesCachedLocally")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
