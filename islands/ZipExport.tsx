import { useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";

type ExportState = "idle" | "preparing" | "downloading" | "success" | "error";

export default function ZipExport() {
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const [apiToken] = useLocalStorage<string>("chatgpt_api_token", "");
  const [teamId] = useLocalStorage<string>("chatgpt_team_id", "personal");
  const [includeMetadata] = useLocalStorage<boolean>(
    "chatgpt_include_metadata",
    true,
  );

  const handleExport = async () => {
    if (!apiToken) {
      setExportState("error");
      setMessage("需要API令牌才能导出");
      return;
    }

    setExportState("preparing");
    setMessage("正在准备导出...");
    setDownloadUrl(null);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: apiToken,
          teamId: teamId === "personal" ? undefined : teamId,
          includeMetadata,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "导出失败");
      }

      setExportState("downloading");
      setMessage("正在生成ZIP文件...");

      // 获取文件名
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "chatgpt_images.zip";
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename="([^"]+)"/);
        if (matches) filename = matches[1];
      }

      // 创建下载
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      // 自动下载
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportState("success");
      setMessage(`导出完成！文件：${filename}`);
    } catch (error) {
      console.error("导出错误:", error);
      setExportState("error");
      setMessage((error as Error).message || "导出失败");
    }
  };

  const resetState = () => {
    setExportState("idle");
    setMessage("");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
  };

  const getStateIcon = () => {
    switch (exportState) {
      case "preparing":
      case "downloading":
        return "🔄";
      case "success":
        return "✅";
      case "error":
        return "❌";
      default:
        return "📦";
    }
  };

  const getStateColor = () => {
    switch (exportState) {
      case "preparing":
      case "downloading":
        return "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900";
      case "success":
        return "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900";
      case "error":
        return "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900";
      default:
        return "";
    }
  };

  const getTextColor = () => {
    switch (exportState) {
      case "preparing":
      case "downloading":
        return "text-blue-800 dark:text-blue-200";
      case "success":
        return "text-green-800 dark:text-green-200";
      case "error":
        return "text-red-800 dark:text-red-200";
      default:
        return "";
    }
  };

  return (
    <div class="space-y-4">
      {/* 导出按钮 */}
      <div class="flex gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exportState === "preparing" ||
            exportState === "downloading" || !apiToken}
          class={`flex-1 sm:flex-none px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
            exportState === "preparing" || exportState === "downloading" ||
              !apiToken
              ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl"
          }`}
        >
          <span class="flex items-center gap-2">
            {getStateIcon()}
            {exportState === "preparing" || exportState === "downloading"
              ? "导出中..."
              : "导出为ZIP"}
          </span>
        </button>

        {/* 重置按钮 */}
        {(exportState === "success" || exportState === "error") && (
          <button
            type="button"
            onClick={resetState}
            class="px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            重置
          </button>
        )}
      </div>

      {/* 状态消息 */}
      {message && (
        <div class={`p-4 rounded-lg border ${getStateColor()}`}>
          <div class={`flex items-center gap-3 ${getTextColor()}`}>
            <span class="text-lg">{getStateIcon()}</span>
            <div class="flex-1">
              <p class="font-medium">{message}</p>

              {/* 进度动画 */}
              {(exportState === "preparing" || exportState === "downloading") &&
                (
                  <div class="mt-2">
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        class="bg-blue-600 h-2 rounded-full animate-pulse"
                        style="width: 60%"
                      >
                      </div>
                    </div>
                    <p class="text-xs mt-1 opacity-75">
                      {exportState === "preparing"
                        ? "正在获取图片列表..."
                        : "正在下载并打包图片..."}
                    </p>
                  </div>
                )}

              {/* 成功时的额外操作 */}
              {exportState === "success" && downloadUrl && (
                <div class="mt-3 flex gap-2">
                  <a
                    href={downloadUrl}
                    download
                    class="inline-flex items-center gap-1 text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  >
                    <span>📥</span>
                    重新下载
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 功能说明 */}
      <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>
          💡 <strong>后端处理</strong>：支持大量图片，无内存限制
        </p>
        <p>
          🚀 <strong>自动下载</strong>：ZIP文件生成后自动开始下载
        </p>
        <p>
          📦 <strong>包含内容</strong>：所有图片{" "}
          {includeMetadata && "+ 元数据文件"}
        </p>
      </div>
    </div>
  );
}
