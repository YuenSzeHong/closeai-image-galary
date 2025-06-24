// islands/ZipExport.tsx - 配合新SSE事件的简化版本
import { useEffect, useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import type { ClientExportState, ExistingTaskResponse, SseEvent } from "../lib/types.ts";

// Local interface with isProcessing property
interface ClientTaskDisplay {
  id?: string;
  totalImages?: number;
  downloadUrl?: string;
  filename?: string;
  ageHours?: number;
  isExisting?: boolean;
  isProcessing?: boolean;
  thumbnailStats?: {
    total: number;
    available: number;
  };
  error?: string;
}

export default function ZipExport() {
  const [state, setState] = useState<ClientExportState>("idle");
  const [task, setTask] = useState<ClientTaskDisplay | null>(null);
  const [message, setMessage] = useState("");
  const [accessToken] = useLocalStorage<string>("chatgpt_access_token", "");
  const [teamId] = useLocalStorage<string>("chatgpt_team_id", "personal");
  const [includeMetadata, setIncludeMetadata] = useLocalStorage<boolean>("chatgpt_include_metadata", true);
  const [includeThumbnails, setIncludeThumbnails] = useLocalStorage<boolean>("chatgpt_include_thumbnails", true);
  // Add state for tracking download abort controller
  const [downloadController, setDownloadController] = useState<AbortController | null>(null);

  const handleExport = async () => {
    if (!accessToken) {
      setState("failed");
      setMessage("需要访问令牌");
      return;
    }

    setState("checking");
    setMessage("正在检查导出任务...");
    setTask(null);

    try {
      const effectiveTeamId = teamId && teamId !== "personal" ? teamId : undefined;

      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: accessToken,
          teamId: effectiveTeamId,
          includeMetadata,
          includeThumbnails,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "网络错误" }));
        throw new Error(errorData.error || "导出失败");
      }

      const contentType = response.headers.get("Content-Type");      if (contentType?.includes("application/json")) {
        // 现有任务
        const existing: ExistingTaskResponse = await response.json();
        
        // Handle the case where the task is still processing
        if (existing.isProcessing) {
          setState("preparing");
          setMessage("找到正在处理的任务");
        } else {
          setState("found_existing");
          setMessage("找到现有任务");
        }
        
        setTask({
          id: existing.taskId,
          totalImages: existing.totalImages,
          downloadUrl: existing.downloadUrl,
          filename: existing.filename,
          ageHours: existing.ageHours,
          isExisting: true,
          isProcessing: existing.isProcessing
        });
      } else if (contentType?.includes("text/event-stream")) {
        // SSE流
        await handleSSE(response);
      } else {
        throw new Error("意外的响应类型");
      }
    } catch (error) {
      console.error("导出错误:", error);
      setState("failed");
      setMessage(`导出失败: ${(error as Error).message}`);
    }
  };

  const handleSSE = async (response: Response) => {
    setState("preparing");
    setMessage("正在准备导出...");

    if (!response.body) {
      throw new Error("无SSE响应体");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ") || line.length <= 6) continue;

          try {
            const event = JSON.parse(line.slice(6)) as SseEvent;
            handleSseEvent(event);
          } catch (parseError) {
            console.warn("SSE解析错误:", parseError);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  const handleSseEvent = (event: SseEvent) => {
    console.log("SSE事件:", event);

    switch (event.type) {
      case "status":
        setState("preparing");
        setMessage(event.message);
        break;

      case "progress":
        setState("preparing");
        setMessage(event.message);
        break;      case "download_ready":
        setState("ready");
        setMessage("导出完成，可以下载");
        setTask({
          id: event.taskId,
          totalImages: event.totalImages,
          downloadUrl: event.downloadUrl,
          filename: event.filename,
          isExisting: false,
          thumbnailStats: event.thumbnailStats
        });
        break;

      case "error":
        setState("failed");
        setMessage(`错误: ${event.error}`);
        break;
    }
  };
  const handleDownload = () => {
    if (!task?.downloadUrl || !task?.filename) {
      setMessage("下载链接无效");
      return;
    }

    setState("downloading");
    setMessage(`正在下载 ${task.filename}...`);

    // Use fetch API instead of anchor element to be able to track and abort downloads
    const abortController = new AbortController();
    const downloadStartTime = Date.now();
    
    // Store the abort controller in a ref or state if you want to expose it for cancellation
    // For example: setAbortController(abortController);
    
    // Start the download
    fetch(task.downloadUrl, {
      signal: abortController.signal,
      headers: {
        'Accept': 'application/zip'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
        // Get file size from headers if available
      const contentLength = response.headers.get('Content-Length');
      const _totalSize = contentLength ? parseInt(contentLength, 10) : null;
      
      // Create a download link for the response
      return response.blob().then(blob => {
        // Create URL for the blob
        const url = globalThis.URL.createObjectURL(blob);
        
        // Create and click a download link
        const link = document.createElement("a");
        link.href = url;
        link.download = task.filename!; // We already checked it's not undefined
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the object URL
        setTimeout(() => globalThis.URL.revokeObjectURL(url), 100);
        
        return blob.size; // Return the size for reporting
      });
    })
    .then((size) => {
      const downloadDuration = (Date.now() - downloadStartTime) / 1000;
      setState("complete");
      setMessage(`下载完成: ${task.filename} (${(size / 1024 / 1024).toFixed(2)} MB, ${downloadDuration.toFixed(1)}秒)`);
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        setState("failed");
        setMessage(`下载已取消: ${task.filename}`);
      } else {
        console.error("Download error:", error);
        setState("failed");
        setMessage(`下载失败: ${error.message}`);
      }
    });
    
    // Add a cancel download button if you want this functionality
    // Usage: abortController.abort() to cancel
  };

  const resetState = () => {
    setState("idle");
    setTask(null);
    setMessage("");
  };

  const getStateIcon = () => {
    switch (state) {
      case "checking": return "🔍";
      case "found_existing": return "🎯";
      case "preparing": return "🔄";
      case "ready": return "📦";
      case "downloading": return "📥";
      case "complete": return "✅";
      case "failed": return "❌";
      default: return "📦";
    }
  };

  const getStateColor = () => {
    switch (state) {
      case "checking":
      case "preparing":
      case "downloading":
        return "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900";
      case "found_existing":
      case "ready":
      case "complete":
        return "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900";
      case "failed":
        return "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900";
      default:
        return "";
    }
  };
  const isProcessing = ["checking", "preparing", "downloading"].includes(state);
  const hasDownload = ["found_existing", "ready", "complete"].includes(state) && task?.downloadUrl && !task?.isProcessing;

  return (
    <div class="space-y-4">
      {/* 导出选项 */}
      <div class="bg-card rounded-lg p-4">
        <h4 class="text-sm font-medium text-card-foreground mb-3">导出选项</h4>
        
        <label class="flex items-center text-sm text-foreground mb-2">
          <input
            type="checkbox"
            checked={includeMetadata}
            onChange={(e) => setIncludeMetadata((e.target as HTMLInputElement).checked)}
            class="mr-2 h-4 w-4"
            disabled={isProcessing}
          />
          包含 metadata.json
        </label>
          <label class="flex items-center text-sm text-foreground">
          <input
            type="checkbox"
            checked={includeThumbnails}
            onChange={(e) => setIncludeThumbnails((e.target as HTMLInputElement).checked)}
            class="mr-2 h-4 w-4"
            disabled={isProcessing}
          />
          包含缩略图 <span className="ml-1 text-xs text-muted-foreground">(可能不是所有图片都有缩略图)</span>
        </label>
      </div>

      {/* 操作按钮 */}
      <div class="flex gap-3">        <button
          type="button"
          onClick={handleExport}
          disabled={isProcessing || !accessToken}
          class={`px-6 py-3 rounded-lg font-medium transition-colors ${
            isProcessing || !accessToken
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary hover:bg-primary/90 text-primary-foreground"
          }`}
        >
          <span class="flex items-center gap-2">
            {getStateIcon()}
            {isProcessing ? "处理中..." : 
              task?.isProcessing ? "正在准备..." : 
              hasDownload ? "重新检查" : "检查并导出"}
          </span>
        </button>

        {hasDownload && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={state === "downloading"}
            class="px-6 py-3 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            📥 下载ZIP
          </button>
        )}

        {(state === "complete" || state === "failed" || hasDownload) && (
          <button
            type="button"
            onClick={resetState}
            class="px-4 py-3 rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
          >
            重置
          </button>
        )}
      </div>

      {/* 状态显示 */}
      {message && (
        <div class={`p-4 rounded-lg border ${getStateColor()}`}>
          <div class="flex items-center gap-3">
            <span class="text-lg">{getStateIcon()}</span>
            <div class="flex-1">
              <p class="font-medium">{message}</p>
                {task && state === "found_existing" && (
                <div class="mt-2 text-sm">
                  <p>📊 包含 <strong>{task.totalImages}</strong> 张图片</p>
                  <p>🕒 创建于 <strong>{task.ageHours}</strong> 小时前</p>
                </div>
              )}
              
              {task && state === "preparing" && task.isExisting && (
                <div class="mt-2 text-sm">
                  <p>⏳ 任务正在处理中，请稍等片刻...</p>
                  <p>📊 包含 <strong>{task.totalImages}</strong> 张图片</p>
                </div>
              )}              {task && state === "ready" && !task.isExisting && (
                <div class="mt-2 text-sm">
                  <p>🎉 导出完成！包含 <strong>{task.totalImages}</strong> 张图片</p>
                  {task.thumbnailStats && (
                    <p>🖼️ 缩略图： <strong>{task.thumbnailStats.available}</strong>/{task.thumbnailStats.total} 张图片拥有可用缩略图</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!accessToken && (
        <p class="text-orange-600 dark:text-orange-400 text-xs">
          ⚠️ 请先在设置中配置访问令牌
        </p>
      )}
    </div>
  );
}