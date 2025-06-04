import { Head } from "$fresh/runtime.ts";
import Header from "../components/Header.tsx";
import SettingsForm from "../islands/SettingsForm.tsx";

export default function Settings() {
  return (
    <>
      <Head>
        <title>设置 - CloseAI 图库</title>
        <meta name="description" content="配置您的 ChatGPT API 设置和数据管理选项" />
      </Head>

      <div class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-300 min-h-screen">
        <div class="max-w-6xl mx-auto px-4 py-6">
          <Header />

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
              应用设置
            </h2>
            
            <div
              id="errorMessage"
              class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 p-4 rounded mb-4 hidden"
            >
            </div>
            
            <SettingsForm />

            {/* Database Management Section */}
            <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                本地存储管理
              </h3>
              <div class="flex gap-2 mb-4">
                <button
                  type="button"
                  id="clearCurrentTeamBtn"
                  class="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors text-sm"
                >
                  清除当前工作区
                </button>
                <button
                  type="button"
                  id="clearAllDataBtn"
                  class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors text-sm"
                >
                  清除所有数据
                </button>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                图像会在本地缓存以便更快加载。如果需要，可使用这些按钮清除缓存数据。
              </p>
            </div>
          </div>
        </div>

        <div
          id="notification"
          class="fixed top-20 right-5 bg-primary text-white p-4 rounded shadow-lg transform translate-x-full transition-transform duration-300 z-40"
        >
          设置保存成功！
        </div>
      </div>
    </>
  );
}
