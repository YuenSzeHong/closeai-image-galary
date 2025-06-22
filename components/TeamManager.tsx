// islands/ZipExport.tsx

import { useEffect, useRef, useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import {
  type ClientExportState,
  type ClientTaskDisplay,
  type ExistingTaskResponse,
  type SseEvent,
} from "../lib/types.ts";

export default function ZipExport() {
  const [clientState, setClientState] = useState<ClientExportState>("idle");
  const [taskDisplay, setTaskDisplay] = useState<ClientTaskDisplay | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [lastDownloadUrl, setLastDownloadUrl] = useState<string | null>(null);
  const [lastFilename, setLastFilename] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const [accessToken] = useLocalStorage<string>("chatgpt_access_token", "");
  const [teamId] = useLocalStorage<string>("chatgpt_team_id", "personal");
  const [includeMetadata, setIncludeMetadata] = useLocalStorage<boolean>(
    "chatgpt_include_metadata",
    true,
  );
  const [includeThumbnails, setIncludeThumbnails] = useLocalStorage<boolean>(
    "chatgpt_include_thumbnails",
    false,
  );

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const handleExport = async () => {
    if (!accessToken) {
      setClientState("failed");
      setMessage("需要访问令牌才能导出");
      globalThis.dispatchEvent(
        new CustomEvent("exportError", {
          detail: { error: "需要访问令牌才能导出" },
        }),
      );
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setClientState("checking_existing");
    setMessage("正在检查是否有可用的导出任务...");
    setTaskDisplay(null);
    setLastDownloadUrl(null);
    setLastFilename(null);
    globalThis.dispatchEvent(new CustomEvent("exportStart"));

    try {
      const effectiveTeamId = (teamId && teamId !== "personal")
        ? teamId
        : undefined;
      console.log(
        "ZipExport: Sending export request with teamId:",
        effectiveTeamId,
        "(original:",
        teamId,
        ")",
      );

      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: accessToken,
          teamId: effectiveTeamId,
          includeMetadata,
          includeThumbnails,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: "网络错误或无效响应",
        }));
        throw new Error(errorData.error || "检查导出任务失败");
      }

      const contentType = response.headers.get("Content-Type");

      if (contentType?.includes("application/json")) {
        const existingTask: ExistingTaskResponse = await response.json();

        if (existingTask.type === "existing_task_found") {
          setClientState("existing_found");
          setMessage(existingTask.message);
          setTaskDisplay({
            id: existingTask.taskId,
            totalImagesFinal: existingTask.totalImages,
            downloadUrl: existingTask.downloadUrl,
            filename: existingTask.filename,
            ageHours: existingTask.ageHours,
            isExistingTask: true,
          });
          setLastDownloadUrl(existingTask.downloadUrl);
          setLastFilename(existingTask.filename);

          globalThis.dispatchEvent(
            new CustomEvent("existingTaskFound", {
              detail: {
                taskId: existingTask.taskId,
                totalImages: existingTask.totalImages,
                ageHours: existingTask.ageHours,
              },
            }),
          );
          return;
        }
      } else if (contentType?.includes("text/event-stream")) {
        await handleSSEStream(response);
        return;
      } else {
        throw new Error("意外的响应类型");
      }
    } catch (error) {
      console.error("导出处理错误:", error);
      setClientState("failed");
      const errorMessage = (error as Error).message || "导出失败";
      setMessage(errorMessage);
      globalThis.dispatchEvent(
        new CustomEvent("exportError", { detail: { error: errorMessage } }),
      );
    }
  };

  const handleSSEStream = async (sseResponse: Response) => {
    setClientState("preparing_metadata");
    setMessage("正在启动新的导出任务...");

    let sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      if (!sseResponse.body) {
        throw new Error("SSE响应体为空");
      }

      sseReader = sseResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await sseReader.read();
        if (done) {
          console.log("SSE stream ended by server.");
          if (
            clientState !== "metadata_ready" &&
            clientState !== "failed" &&
            clientState !== "export_complete" &&
            clientState !== "downloading"
          ) {
            setMessage("导出流意外关闭，未收到下载指令。");
            setClientState("failed");
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        // ❤️❤️❤️ 听你的话，我们现在循环处理每一行！ ❤️❤️❤️
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.length <= 6) {
            continue;
          }

          try {
            const eventData = JSON.parse(line.slice(6)) as SseEvent;
            console.log("Processing event:", eventData);

            if (eventData.type === "status") {
              const newDisplayData: ClientTaskDisplay = {
                id: eventData.id,
                metadataStatus: eventData.stages.metadata.status,
                metadataProgress: eventData.stages.metadata.progress,
                metadataCurrentBatch: eventData.stages.metadata.currentBatch,
                metadataTotalImages: eventData.stages.metadata.totalImages,
                overallProgress: eventData.progress,
                totalImagesFinal:
                  taskDisplay?.totalImagesFinal || eventData.totalImages,
                error: eventData.error,
                downloadUrl: eventData.downloadUrl,
                filename: eventData.filename,
                isExistingTask: false,
              };
              setTaskDisplay(newDisplayData);

              switch (eventData.status) {
                case "preparing":
                case "processing":
                  setClientState("preparing_metadata");
                  if (eventData.stages.metadata.status === "running") {
                    const batchInfo = eventData.stages.metadata.currentBatch
                      ? ` (批次 ${eventData.stages.metadata.currentBatch})`
                      : "";
                    const imageInfo =
                      eventData.stages.metadata.totalImages !== undefined
                        ? ` - 已发现 ${eventData.stages.metadata.totalImages} 张图片`
                        : "";
                    setMessage(`正在获取图片列表${batchInfo}${imageInfo}`);
                  } else {
                    setMessage("准备导出...");
                  }
                  break;
                case "download_ready":
                  setClientState("metadata_ready");
                  setMessage(
                    `图片列表准备就绪 (${
                      eventData.totalImages || 0
                    } 张)，可以开始下载了！`,
                  );
                  setLastDownloadUrl(eventData.downloadUrl || null);
                  setLastFilename(eventData.filename || null);
                  globalThis.dispatchEvent(
                    new CustomEvent("exportReady", {
                      detail: {
                        filename: eventData.filename,
                        totalImages: eventData.totalImages,
                      },
                    }),
                  );
                  break;
                case "failed":
                  setClientState("failed");
                  setMessage(`导出失败: ${eventData.error || "未知错误"}`);
                  globalThis.dispatchEvent(
                    new CustomEvent("exportError", {
                      detail: { error: eventData.error || "未知错误" },
                    }),
                  );
                  sseReader?.cancel().catch((e) =>
                    console.warn("Error cancelling reader on fail:", e),
                  );
                  return;
              }
            } else if (eventData.type === "download_ready") {
              setClientState("metadata_ready");
              setMessage(
                `图片列表准备就绪 (${
                  eventData.totalImages || 0
                } 张)，可以开始下载了！`,
              );
              setTaskDisplay((prev) => ({
                ...prev,
                id: eventData.taskId || prev?.id,
                downloadUrl: eventData.downloadUrl,
                filename: eventData.filename,
                totalImagesFinal: eventData.totalImages,
                isExistingTask: false,
              }));
              setLastDownloadUrl(eventData.downloadUrl || null);
              setLastFilename(eventData.filename || null);
              globalThis.dispatchEvent(
                new CustomEvent("exportReady", {
                  detail: {
                    filename: eventData.filename,
                    totalImages: eventData.totalImages,
                  },
                }),
              );
            } else if (eventData.type === "error") {
              setClientState("failed");
              setMessage(`服务器错误: ${eventData.error || "未知错误"}`);
              globalThis.dispatchEvent(
                new CustomEvent("exportError", {
                  detail: { error: eventData.error || "未知错误" },
                }),
              );
              sseReader?.cancel().catch((e) =>
                console.warn(
                  "Error cancelling reader on server error event:",
                  e,
                ),
              );
              return;
            }

            // ❤️❤️❤️ 魔法暂停！处理完一个事件就歇一下，让UI更新 ❤️❤️❤️
            await new Promise((resolve) => setTimeout(resolve, 10));
          } catch (parseError) {
            console.warn("解析SSE数据失败:", parseError, "原始数据:", line);
          }
        }
      }
    } catch (error) {
      console.error("SSE流处理错误:", error);
      setClientState("failed");
      const errorMessage = (error as Error).message || "导出失败";
      setMessage(errorMessage);
      globalThis.dispatchEvent(
        new CustomEvent("exportError", { detail: { error: errorMessage } }),
      );
      sseReader?.cancel().catch((e) =>
        console.warn("Error cancelling reader on catch:", e),
      );
    }
  };

  // ... (剩余的所有函数 handleDownloadFromUrl, resetState, etc. 保持不变)
  const handleDownloadFromUrl = (downloadUrl: string, filename: string) => {
    if (!downloadUrl || !filename) {
      setMessage("下载链接或文件名无效。");
      setClientState("failed");
      return;
    }
    setClientState("downloading");
    setMessage(`正在下载 ${filename}...`);

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      if (clientState === "downloading") {
        setClientState("export_complete");
        setMessage(
          `${filename} 下载已开始！ (共 ${
            taskDisplay?.totalImagesFinal || "多"
          } 张图片)`,
        );
        globalThis.dispatchEvent(
          new CustomEvent("exportSuccess", { detail: { filename } }),
        );
      }
    }, 1500);
  };

  const handleManualDownload = () => {
    if (lastDownloadUrl && lastFilename) {
      handleDownloadFromUrl(lastDownloadUrl, lastFilename);
    } else {
      setMessage("没有可用的下载链接。请重新导出。");
    }
  };

  const resetState = () => {
    setClientState("idle");
    setTaskDisplay(null);
    setMessage("");
    setLastDownloadUrl(null);
    setLastFilename(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const isProcessing = clientState === "checking_existing" ||
    clientState === "preparing_metadata" || clientState === "downloading";
  const hasDownloadReady =
    (clientState === "existing_found" || clientState === "metadata_ready" ||
      clientState === "export_complete" || clientState === "downloading") &&
    lastDownloadUrl;

  const getStateIcon = () => {
    switch (clientState) {
      case "checking_existing":
        return "🔍";
      case "existing_found":
        return "🎯";
      case "preparing_metadata":
        return "🔄";
      case "metadata_ready":
        return "📦";
      case "downloading":
        return "📥";
      case "export_complete":
        return "✅";
      case "failed":
        return "❌";
      default:
        return "📦";
    }
  };

  const getStateColor = () => {
    switch (clientState) {      case "checking_existing":
      case "preparing_metadata":
      case "downloading":
        return "border-blue-200 bg-blue-100/50 dark:border-blue-800/30 dark:bg-blue-900/20";
      case "existing_found":
      case "metadata_ready":
        return "border-primary/30 bg-primary-100/50 dark:border-primary/30 dark:bg-primary/20";
      case "export_complete":
        return "border-primary/30 bg-primary-100/50 dark:border-primary/30 dark:bg-primary/20";
      case "failed":
        return "border-destructive/30 bg-destructive/10 dark:border-destructive/30 dark:bg-destructive/20";
      default:
        return "";
    }
  };

  const getTextColor = () => {
    switch (clientState) {      case "checking_existing":
      case "preparing_metadata":
      case "downloading":
        return "text-blue-700 dark:text-blue-300";
      case "existing_found":
      case "metadata_ready":
        return "text-primary-700 dark:text-primary-300";
      case "export_complete":
        return "text-primary-700 dark:text-primary-300";
      case "failed":
        return "text-destructive dark:text-destructive";
      default:
        return "";
    }
  };

  return (
    <div class="space-y-4">
      {/* Export Options */}      <div class="bg-card rounded-lg p-4">
        <h4 class="text-sm font-medium text-card-foreground mb-3">
          导出选项
        </h4>
        <label
          for="exportIncludeMetadata"
          class="flex items-center text-sm text-foreground"
        >
          <input
            type="checkbox"
            id="exportIncludeMetadata"
            checked={includeMetadata}
            onChange={(e) =>
              setIncludeMetadata((e.target as HTMLInputElement).checked)}
            class="mr-2 h-4 w-4 text-primary focus:ring-primary border-input rounded bg-background"
            disabled={isProcessing}
          />
          在 ZIP 文件中包含 metadata.json
        </label>
        <p class="text-xs text-muted-foreground mt-1 ml-6">
          包含图像的详细信息（标题、尺寸、创建时间等）
        </p>
        <label
          for="exportIncludeThumbnails"
          class="flex items-center text-sm text-foreground"
        >
          <input
            type="checkbox"
            id="exportIncludeThumbnails"
            checked={includeThumbnails}
            onChange={(e) =>
              setIncludeThumbnails((e.target as HTMLInputElement).checked)}
            class="mr-2 h-4 w-4 text-primary focus:ring-primary border-input rounded bg-background"
            disabled={isProcessing}
          />
          在 ZIP 文件中包含缩略图
        </label>
        <p class="text-xs text-muted-foreground mt-1 ml-6">
          包含图像的缩略图，便于快速浏览
        </p>
      </div>

      {/* Action Buttons */}
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={isProcessing || !accessToken}
          data-export-trigger
          title="检查并导出"          class={`flex-1 sm:flex-none px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
            isProcessing || !accessToken
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary hover:bg-primary/90 text-primary-foreground shadow hover:shadow-lg"
          }`}
        >
          <span class="flex items-center justify-center gap-2">
            {getStateIcon()}
            {isProcessing
              ? clientState === "checking_existing" ? "检查中..." : "处理中..."
              : hasDownloadReady
              ? "重新检查导出"
              : "检查并导出"}
          </span>
        </button>

        {hasDownloadReady && (
          <button
            type="button"
            onClick={handleManualDownload}
            class={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
              clientState === "downloading"
                ? "bg-gray-400 text-white cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl"
            }`}
            disabled={clientState === "downloading"}
          >
            <span class="flex items-center justify-center gap-2">
              📥
              {clientState === "downloading" ? "下载中..." : "下载ZIP"}
            </span>
            {lastFilename && (
              <span class="text-xs block opacity-75 mt-1">
                {lastFilename.length > 25
                  ? lastFilename.substring(0, 22) + "..."
                  : lastFilename}
              </span>
            )}
          </button>
        )}

        {(clientState === "export_complete" || clientState === "failed" ||
          hasDownloadReady) && (
          <button
            type="button"
            onClick={resetState}
            class="px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            重置
          </button>
        )}
      </div>

      {/* Status Message and Progress */}
      {message && (
        <div class={`p-4 rounded-lg border ${getStateColor()}`}>
          <div class={`flex items-center gap-3 ${getTextColor()}`}>
            <span class="text-lg">{getStateIcon()}</span>
            <div class="flex-1">
              <p class="font-medium">{message}</p>

              {taskDisplay && clientState === "existing_found" && (
                <div class="mt-3 space-y-2">
                  <div class="text-sm">
                    <p>
                      📊 包含 <strong>{taskDisplay.totalImagesFinal}</strong>
                      {" "}
                      张图片
                    </p>
                    <p>
                      🕒 创建于 <strong>{taskDisplay.ageHours}</strong> 小时前
                    </p>
                  </div>
                  <div class="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-800 rounded p-2">
                    💡 无需重新处理，点击"下载ZIP"即可立即获取文件
                  </div>
                </div>
              )}

              {taskDisplay && clientState === "preparing_metadata" && (
                <div class="mt-3 space-y-2">
                  <div class="flex items-center gap-2 text-xs">
                    <div
                      class={`w-4 h-4 rounded-full flex items-center justify-center ${
                        taskDisplay.metadataStatus === "completed"
                          ? "bg-green-500 text-white"
                          : taskDisplay.metadataStatus === "running"
                          ? "bg-blue-500 text-white animate-pulse"
                          : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    >
                      {taskDisplay.metadataStatus === "completed"
                        ? "✓"
                        : taskDisplay.metadataStatus === "running"
                        ? "⟳"
                        : "1"}
                    </div>
                    <span class="min-w-0 flex-1">获取图片列表</span>
                    <span class="text-gray-500 dark:text-gray-400">
                      {Math.round(taskDisplay.metadataProgress || 0)}%
                    </span>
                  </div>
                  {taskDisplay.metadataTotalImages !== undefined && (
                    <div class="text-xs text-gray-500 dark:text-gray-400 pt-1 mt-1 border-t border-gray-200 dark:border-gray-600">
                      已发现 {taskDisplay.metadataTotalImages} 张图片
                      {taskDisplay.metadataCurrentBatch
                        ? ` (批次 ${taskDisplay.metadataCurrentBatch})`
                        : ""}
                    </div>
                  )}
                </div>
              )}

              {taskDisplay && clientState === "metadata_ready" &&
                !taskDisplay.isExistingTask && (
                <div class="mt-3 space-y-2">
                  <div class="text-sm">
                    <p>🎉 导出任务准备完成！</p>
                    <p>
                      📊 包含 <strong>{taskDisplay.totalImagesFinal}</strong>
                      {" "}
                      张图片
                    </p>
                  </div>
                  <div class="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-800 rounded p-2">
                    💡 点击"下载ZIP"开始下载，文件将实时生成并传输
                  </div>
                </div>
              )}

              {clientState === "export_complete" && taskDisplay && (
                <div class="mt-2 text-sm">
                  <p>
                    ✅ {taskDisplay.filename || "文件"} 下载已开始。
                  </p>
                  {taskDisplay.totalImagesFinal !== undefined && (
                    <p class="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      包含 {taskDisplay.totalImagesFinal} 张图片。
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feature Description */}
      <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>
          🔍 <strong>智能检查</strong>：自动检查是否有可复用的导出任务。
        </p>
        <p>
          🌊 <strong>流式处理</strong>：实时进度推送，ZIP文件直接流式下载。
        </p>
        <p>
          ☁️ <strong>云端协调</strong>：使用 Deno KV 存储任务状态。
        </p>
        <p>
          ⚡{" "}
          <strong>按需下载</strong>：准备就绪后显示下载按钮，用户决定何时下载。
        </p>{" "}
        {!accessToken && (
          <p class="text-orange-600 dark:text-orange-400">
            ⚠️ 请先在设置中配置访问令牌
          </p>
        )}
      </div>
    </div>
  );
}