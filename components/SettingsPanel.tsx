import SettingsForm from "../islands/SettingsForm.tsx";

export default function SettingsPanel() {
  return (
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
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
          </button>{" "}
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

      <div class="text-sm text-gray-600 dark:text-gray-400">
        <p class="mb-2">
          提供您的 ChatGPT API 令牌。对于团队工作区，还需提供团队
          ID。设置会在本地存储。
        </p>
        <p class="font-semibold mb-1 text-gray-700 dark:text-gray-300">
          如何获取 API 令牌和团队 ID：
        </p>
        <ol class="list-decimal pl-5 space-y-1 mb-3">
          <li>
            Login to{" "}
            <a
              href="https://chatgpt.com"
              target="_blank"
              class="text-primary hover:underline"
            >
              ChatGPT
            </a>。打开开发者工具 (F12) {"> "}网络。
          </li>
          <li>
            刷新/发起请求。查找 API 调用（例如到 `.../conversation`）。
          </li>{" "}
          <li>令牌："Authorization" 头部（复制 "Bearer " 后的值）。</li>
          <li>团队 ID：`chatgpt-account-id` 头部（如果在团队工作区中）。</li>
        </ol>
      </div>
    </div>
  );
}
