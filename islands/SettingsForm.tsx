import { useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import TeamSelector from "./TeamSelector.tsx";
import { cleanToken } from "../lib/chatgpt-client.ts";

export default function SettingsForm() {
  const [token, setToken] = useLocalStorage<string>("chatgpt_access_token", "");
  const [teamId, setTeamId] = useLocalStorage<string>(
    "chatgpt_team_id",
    "personal",
  );
  const [batchSize, setBatchSize] = useLocalStorage<number>(
    "chatgpt_batch_size",
    50,
  );
  const [isLoading, setIsLoading] = useState(false);

  const showError = (message: string) => {
    const errorEl = document.getElementById("errorMessage");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove("hidden");
    }
  };

  const hideError = () => {
    const errorEl = document.getElementById("errorMessage");
    if (errorEl) {
      errorEl.classList.add("hidden");
    }
  };

  const showNotification = (message: string) => {
    if (globalThis.showNotification) {
      globalThis.showNotification(message, "success");
    }
  };
  const handleSaveSettings = () => {
    if (!token.trim()) {
      showError("请输入有效的访问令牌");
      return;
    }

    hideError();
    setIsLoading(true);
    try {
      // Validate token using the centralized cleanToken utility
      const cleanedToken = cleanToken(token);

      if (cleanedToken.length < 10) {
        throw new Error("令牌长度过短");
      }

      // Ensure teamId is properly set
      const finalTeamId = teamId || "personal";
      console.log("Saving settings with teamId:", finalTeamId);

      // Save settings
      setToken(cleanToken);
      setTeamId(finalTeamId);
      setBatchSize(Math.max(1, Math.min(1000, batchSize)));

      // Trigger gallery reload
      showNotification("设置已保存。正在加载图像...");
      globalThis.dispatchEvent(
        new CustomEvent("settingsSaved", {
          detail: { token: cleanToken, teamId: finalTeamId },
        }),
      );
    } catch (error) {
      showError((error as Error).message || "保存设置失败");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <>
      <div class="mb-4">
        <label
          for="tokenInput"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          ChatGPT 访问令牌：
        </label>{" "}
        <input
          type="password"
          id="tokenInput"
          placeholder="输入您的 ChatGPT 访问令牌"
          value={token}
          onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      <TeamSelector
        accessToken={token}
        selectedTeamId={teamId}
        onTeamChange={setTeamId}
        className="mb-4"
      />
      <div class="mb-4 sm:flex sm:items-center sm:gap-4">
        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={isLoading}
          class={`w-full sm:w-auto px-6 py-3 rounded transition-colors mb-3 sm:mb-0 ${
            isLoading
              ? "bg-gray-400 cursor-not-allowed text-white"
              : "bg-primary-500 text-white hover:bg-primary-600"
          }`}
        >
          {isLoading ? "加载中..." : "保存设置并加载图像"}
        </button>
        <div class="flex items-center gap-2">
          <label
            for="batchSizeInput"
            class="text-sm text-gray-700 dark:text-gray-300"
          >
            API 批次大小：
          </label>{" "}
          <input
            type="number"
            id="batchSizeInput"
            min="1"
            max="1000"
            step="1"
            value={batchSize}
            onInput={(e) =>
              setBatchSize(
                parseInt((e.target as HTMLInputElement).value) || 50,
              )}
            class="w-24 p-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <span class="text-xs text-gray-400 dark:text-gray-500">
            （1-1000，用于 API 元数据）
          </span>
        </div>
      </div>

      {/* Quick Export Section */}
      {token && (
        <div class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              快速导出
            </h4>
            <a
              href="/settings#export"
              class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              查看完整导出选项
            </a>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
            设置保存后，您可以前往{" "}
            <a
              href="/settings#export"
              class="text-blue-600 dark:text-blue-400 hover:underline"
            >
              导出图像
            </a>{" "}
            下载所有图像为 ZIP 文件
          </p>
        </div>
      )}
    </>
  );
}
