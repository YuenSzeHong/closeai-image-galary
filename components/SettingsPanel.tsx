export default function SettingsPanel() {
  return (
    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
      <div class="flex items-center gap-3">
        <svg
          class="w-6 h-6 text-blue-600 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div class="flex-1">
          <h3 class="font-medium text-blue-900 dark:text-blue-100">
            需要配置访问设置
          </h3>
          <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
            请前往设置页面配置您的 ChatGPT 访问令牌以开始使用图库功能。
          </p>
        </div>
        <a
          href="/settings"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          前往设置
        </a>
      </div>
    </div>
  );
}
