import { useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";

export default function SettingsForm() {
  const [token, setToken] = useLocalStorage<string>("chatgpt_api_token", "");
  const [teamId, setTeamId] = useLocalStorage<string>(
    "chatgpt_team_id",
    "personal",
  );
  const [batchSize, setBatchSize] = useLocalStorage<number>(
    "chatgpt_batch_size",
    50,
  );
  const [includeMetadata, setIncludeMetadata] = useLocalStorage<boolean>(
    "chatgpt_include_metadata",
    true,
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
    const notification = document.getElementById("notification");
    if (notification) {
      notification.textContent = message;
      notification.classList.remove("translate-x-full");
      notification.classList.add("translate-x-0");
      setTimeout(() => {
        notification.classList.add("translate-x-full");
        notification.classList.remove("translate-x-0");
      }, 3000);
    }
  };
  const handleSaveSettings = () => {
    if (!token.trim()) {
      showError("请输入有效的 API 令牌");
      return;
    }

    hideError();
    setIsLoading(true);

    try {
      // Validate token format
      const cleanToken = token.startsWith("Bearer ")
        ? token.substring(7).trim()
        : token.trim();

      if (cleanToken.length < 10) {
        throw new Error("令牌长度过短");
      }

      // Save settings
      setToken(cleanToken);
      setTeamId(teamId || "personal");
      setBatchSize(Math.max(1, Math.min(1000, batchSize)));
      setIncludeMetadata(includeMetadata);

      // Trigger gallery reload
      showNotification("设置已保存。正在加载图像...");
      globalThis.dispatchEvent(
        new CustomEvent("settingsSaved", {
          detail: { token: cleanToken, teamId: teamId || "personal" },
        }),
      );
    } catch (error) {
      showError(error.message || "保存设置失败");
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
          ChatGPT API 令牌：
        </label>
        <input
          type="password"
          id="tokenInput"
          placeholder="输入您的 ChatGPT API 令牌"
          value={token}
          onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>
      <div class="mb-4">
        <label
          for="teamIdInput"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          团队 ID（可选）：
        </label>
        <input
          type="text"
          id="teamIdInput"
          placeholder="输入团队工作区的团队 ID（个人账户请留空）"
          value={teamId === "personal" ? "" : teamId}
          onInput={(e) => {
            const value = (e.target as HTMLInputElement).value.trim();
            setTeamId(value || "personal");
          }}
          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>
      <div class="mb-4 sm:flex sm:items-center sm:gap-4">
        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={isLoading}
          class={`w-full sm:w-auto px-6 py-3 rounded transition-colors mb-3 sm:mb-0 ${
            isLoading
              ? "bg-gray-400 cursor-not-allowed text-white"
              : "bg-primary text-white hover:bg-primaryDark"
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
          </label>
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
            class="w-24 p-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <span class="text-xs text-gray-400 dark:text-gray-500">
            （1-1000，用于 API 元数据）
          </span>
        </div>
      </div>
      <div class="mb-4">
        <label
          for="includeMetadataCheckbox"
          class="flex items-center text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            type="checkbox"
            id="includeMetadataCheckbox"
            checked={includeMetadata}
            onChange={(e) =>
              setIncludeMetadata((e.target as HTMLInputElement).checked)}
            class="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
          />
          在 ZIP 文件中包含 metadata.json
        </label>
      </div>
    </>
  );
}
