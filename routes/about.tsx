import { Head } from "$fresh/runtime.ts";
import Header from "../components/Header.tsx";

export default function About() {
  return (
    <>
      <Head>
        <title>关于 - CloseAI 图库</title>
        <meta name="description" content="了解 CloseAI 图库的功能特点和使用方法" />
      </Head>

      <div class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-300 min-h-screen">
        <div class="max-w-6xl mx-auto px-4 py-6">
          <Header />

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            <h2 class="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
              关于 CloseAI 图库
            </h2>
            
            <div class="prose dark:prose-invert max-w-none">
              <h3 class="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
                使用方法
              </h3>
              <div class="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-6 mb-8">
                <h4 class="font-semibold mb-3 text-gray-900 dark:text-white">
                  如何获取访问令牌和团队 ID
                </h4>
                <ol class="list-decimal pl-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li>
                    登录到{" "}
                    <a
                      href="https://chatgpt.com"
                      target="_blank"
                      class="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      ChatGPT
                    </a>
                    。打开开发者工具 (F12) {">"} 网络标签页。
                  </li>
                  <li>
                    刷新页面或发起请求。查找 API 调用（例如到 `conversation` 的请求）。
                  </li>
                  <li>
                    访问令牌：在请求头中找到 "Authorization"（复制 "Bearer " 后的值）。
                  </li>
                  <li>
                    团队 ID：在请求头中找到 `chatgpt-account-id`（仅在团队工作区中需要）。
                  </li>
                </ol>
              </div>

              <h3 class="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
                开源项目
              </h3>
              <p class="mb-4 text-gray-600 dark:text-gray-300">
                本项目采用 MIT 开源协议，由 YuenSzeHong 开发。欢迎访问 GitHub 仓库查看源代码、报告问题或贡献代码。
              </p>
              <a
                href="https://github.com/YuenSzeHong/closeai-image-galary"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 bg-gray-900 dark:bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clip-rule="evenodd" />
                </svg>
                查看 GitHub 仓库
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
