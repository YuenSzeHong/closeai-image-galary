// islands/ZipExport.tsx

import { useEffect, useRef, useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import {
  type ClientExportState,
  type ClientTaskDisplay,
  type ExistingTaskResponse,
  type SseDownloadReadyPayload,
  type SseErrorPayload,
  type SseEvent,
  type SseMetadataProgressPayload,
  type SseStatusPayload,
} from "../lib/types.ts";
import ExportStatusDisplay from "../components/ExportStatusDisplay.tsx"; // 导入 ExportStatusDisplay 组件

// islands/ZipExport.tsx

// ... (其他 import 和组件顶部代码不变)

export default function ZipExport() {
  const [clientState, setClientState] = useState<ClientExportState>("idle");
  const [taskDisplay, setTaskDisplay] = useState<ClientTaskDisplay | null>(
    null,
  );
  const [message, setMessage] = useState(""); // 保持这个 state 用于显示简单消息
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
    console.log("ZipExport component mounted or re-rendered!"); // 确保这个每次渲染都会打
    return () => {
      console.log("ZipExport component unmounted!");
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  /** Handles the export button click. */
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

    // 简化初始状态设置
    setClientState("checking_existing");
    setMessage("正在检查是否有可用的导出任务...");
    setTaskDisplay(null); // 清空旧的任务显示数据
    setLastDownloadUrl(null);
    setLastFilename(null);
    // globalThis.dispatchEvent(new CustomEvent("exportStart")); // 暂时禁用，减少干扰

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
          setMessage("找到现有任务！可以下载。"); // 简化消息
          setLastDownloadUrl(existingTask.downloadUrl);
          setLastFilename(existingTask.filename);
          // globalThis.dispatchEvent(new CustomEvent("existingTaskFound", { detail: existingTask })); // 暂时禁用
          return;
        }
      } else if (contentType?.includes("text/event-stream")) {
        console.log("Starting SSE stream for new task.");
        handleSSEStream(response); // 非阻塞调用
        return;
      } else {
        throw new Error("意外的响应类型");
      }
    } catch (error) {
      console.error("导出处理错误:", error);
      setClientState("failed");
      setMessage(`导出失败: ${(error as Error).message || "未知错误"}`); // 简化错误消息
      // globalThis.dispatchEvent(new CustomEvent("exportError", { detail: { error: errorMessage } })); // 暂时禁用
    }
  };

  /** Handles the Server-Sent Events (SSE) stream from the backend. */
  const handleSSEStream = async (sseResponse: Response) => {
    // 简化初始消息和状态
    setClientState("preparing_metadata");
    setMessage("SSE Stream 启动，正在接收数据...");
    console.log("handleSSEStream: Function started.");

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
        console.log("handleSSEStream: --- START while loop iteration ---");
        const { done, value } = await sseReader.read();
        console.log("handleSSEStream: Read stream done:", done, "value length:", value?.length);

        if (done) {
          console.log("handleSSEStream: SSE stream ended by server. Breaking loop.");
          // 简化最终状态
          setClientState("export_complete");
          setMessage("SSE Stream 结束！");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        console.log("handleSSEStream: Buffer processed. Lines to process:", lines.length);

        for (const line of lines) {
          if (!line.startsWith("data: ") || line.length <= 6) {
            console.log("handleSSEStream: Skipping non-data line:", line);
            continue;
          }

          try {
            const eventData = JSON.parse(line.slice(6)) as SseEvent;
            console.log("handleSSEStream: Received SSE event:", eventData.type);

            // ❤️❤️❤️ 只根据 event.type 更新一个简单的消息和状态！
            switch (eventData.type) {
              case "status":
                const statusPayload = eventData as SseStatusPayload;
                setClientState(statusPayload.status === "download_ready" ? "metadata_ready" : "preparing_metadata");
                setMessage(`状态: ${statusPayload.status}, 进度: ${statusPayload.progress}%`);
                if (statusPayload.status === "download_ready") {
                    setLastDownloadUrl(statusPayload.downloadUrl || null);
                    setLastFilename(statusPayload.filename || null);
                    setMessage(`下载就绪: ${statusPayload.filename}`);
                }
                break;
              case "metadata_progress":
                const progressPayload = eventData as SseMetadataProgressPayload;
                setClientState("preparing_metadata");
                setMessage(`元数据进度: ${progressPayload.progress}%, 发现图片: ${progressPayload.totalImages}`);
                break;
              case "download_ready":
                const downloadPayload = eventData as SseDownloadReadyPayload;
                setClientState("metadata_ready");
                setMessage(`下载就绪！文件名: ${downloadPayload.filename}`);
                setLastDownloadUrl(downloadPayload.downloadUrl);
                setLastFilename(downloadPayload.filename);
                break;
              case "error":
                const errorPayload = eventData as SseErrorPayload;
                setClientState("failed");
                setMessage(`错误: ${errorPayload.error}`);
                break;
              default:
                setMessage("收到未知事件！");
                break;
            }

            console.log("handleSSEStream: Calling setState, current message:", `"${message}"`); // 这里的 message 可能是旧值，正常
            await new Promise((resolve) => setTimeout(resolve, 10)); // 强制让出控制权
            console.log("handleSSEStream: UI yield completed. Next loop iteration.");
          } catch (parseError) {
            console.warn("handleSSEStream: Parsing SSE data failed:", parseError, "Raw data:", line);
          }
        }
        console.log("handleSSEStream: --- END while loop iteration ---");
      }
    } catch (error) {
      console.error("handleSSEStream: SSE stream processing error:", error);
      setClientState("failed");
      setMessage(`流错误: ${(error as Error).message || "未知流错误"}`);
      // globalThis.dispatchEvent(new CustomEvent("exportError", { detail: { error: errorMessage } })); // 暂时禁用
      sseReader?.cancel().catch((e) => console.warn("handleSSEStream: Error cancelling reader on catch:", e));
    } finally {
        console.log("handleSSEStream: Finally block executed.");
        // sseReader?.releaseLock(); // 确保 reader 被释放
    }
  };

  /** Triggers the browser download for a given URL and filename. */
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
        setMessage(`下载开始：${filename}`);
        // globalThis.dispatchEvent(new CustomEvent("exportSuccess", { detail: { filename } })); // 暂时禁用
      }
    }, 1500);
  };

  /** Handles manual download attempts from the UI. */
  const handleManualDownload = () => {
    if (lastDownloadUrl && lastFilename) {
      handleDownloadFromUrl(lastDownloadUrl, lastFilename);
    } else {
      setMessage("没有可用的下载链接。请重新导出。");
    }
  };

  /** Resets the component's state to idle. */
  const resetState = () => {
    console.log("Resetting state...");
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
    switch (clientState) {
      case "checking_existing":
      case "preparing_metadata":
      case "downloading":
        return "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900";
      case "existing_found":
      case "metadata_ready":
        return "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900";
      case "export_complete":
        return "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900";
      case "failed":
        return "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900";
      default:
        return "";
    }
  };

  const getTextColor = () => {
    switch (clientState) {
      case "checking_existing":
      case "preparing_metadata":
      case "downloading":
        return "text-blue-800 dark:text-blue-200";
      case "existing_found":
      case "metadata_ready":
        return "text-green-800 dark:text-green-200";
      case "export_complete":
        return "text-green-800 dark:text-green-200";
      case "failed":
        return "text-red-800 dark:text-red-200";
      default:
        return "";
    }
  };

  return (
    <div class="space-y-4">
      {/* Export Options Section */}
      <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
          导出选项
        </h4>
        <label
          htmlFor="exportIncludeMetadata"
          class="flex items-center text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            type="checkbox"
            id="exportIncludeMetadata"
            checked={includeMetadata}
            onChange={(e) =>
              setIncludeMetadata((e.target as HTMLInputElement).checked)}
            class="mr-2 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            disabled={isProcessing}
          />
          在 ZIP 文件中包含 metadata.json
        </label>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
          包含图像的详细信息（标题、尺寸、创建时间等）
        </p>
        <label
          htmlFor="exportIncludeThumbnails"
          class="flex items-center text-sm text-gray-700 dark:text-gray-300"
        >
          <input
            type="checkbox"
            id="exportIncludeThumbnails"
            checked={includeThumbnails}
            onChange={(e) =>
              setIncludeThumbnails((e.target as HTMLInputElement).checked)}
            class="mr-2 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            disabled={isProcessing}
          />
          在 ZIP 文件中包含缩略图
        </label>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
          包含图像的缩略图，便于快速浏览
        </p>
      </div>

      {/* Action Buttons Section */}
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={isProcessing || !accessToken}
          data-export-trigger
          title="检查并导出"
          class={`flex-1 sm:flex-none px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
            isProcessing || !accessToken
              ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl"
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

      {/* 渲染状态显示组件 */}
      <ExportStatusDisplay
        clientState={clientState}
        message={message}
        taskDisplay={taskDisplay}
      />

      {/* Feature Description Section */}
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