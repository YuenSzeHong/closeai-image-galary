import ThemeToggle from "../islands/ThemeToggle.tsx";

export default function Header() {
  return (
    <header class="mb-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-3xl font-bold text-center text-gray-900 dark:text-white">
            CloseAI 图库
          </h1>
          <p class="text-center text-gray-600 dark:text-gray-400">
            查看您生成的所有图像
          </p>
        </div>
        <ThemeToggle />
      </div>      <nav>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2 flex gap-1">
          <a
            href="/"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            图库
          </a>          <a
            href="/settings"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            title="设置 (Ctrl+,)"
          >
            设置
          </a>
          <a
            href="/about"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            关于
          </a>
        </div>
      </nav>
    </header>
  );
}
