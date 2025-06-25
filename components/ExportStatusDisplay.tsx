// components/ExportStatusDisplay.tsx

import {
  type ClientExportState,
  type ClientTaskDisplay,
} from "../lib/types.ts";

/**
 * Props for ExportStatusDisplay component.
 */
interface ExportStatusDisplayProps {
  /** The current client-side export state. */
  clientState: ClientExportState;
  /** The current message to display to the user. */
  message: string;
  /** Detailed task display data. */
  taskDisplay: ClientTaskDisplay | null;
}

/**
 * A dedicated component for displaying the real-time status and progress of the export task.
 * It abstracts away the UI logic related to various export states and progress indicators.
 */
export default function ExportStatusDisplay(props: ExportStatusDisplayProps) {
  const { clientState, message, taskDisplay } = props;

  /** Returns an emoji icon based on the current client state. */
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

  /** Returns Tailwind CSS classes for border and background color based on the current client state. */
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

  /** Returns Tailwind CSS classes for text color based on the current client state. */
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

  // Only render if there's a message to display
  if (!message) {
    return null;
  }

  return (
    <div class={`p-4 rounded-lg border ${getStateColor()}`}>
      <div class={`flex items-center gap-3 ${getTextColor()}`}>
        <span class="text-lg">{getStateIcon()}</span>
        <div class="flex-1">
          <p class="font-medium">{message}</p>

          {/* Display for existing task found */}
          {taskDisplay && clientState === "existing_found" && (
            <div class="mt-3 space-y-2">
              <div class="text-sm">
                <p>
                  📊 包含 <strong>{taskDisplay.totalImagesFinal}</strong> 张图片
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

          {/* Display for new task preparing metadata */}
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

          {/* Display for new task ready for download */}
          {taskDisplay && clientState === "metadata_ready" &&
            !taskDisplay.isExistingTask && (
            <div class="mt-3 space-y-2">
              <div class="text-sm">
                <p>🎉 导出任务准备完成！</p>
                <p>
                  📊 包含 <strong>{taskDisplay.totalImagesFinal}</strong> 张图片
                </p>
              </div>
              <div class="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-800 rounded p-2">
                💡 点击"下载ZIP"开始下载，文件将实时生成并传输
              </div>
            </div>
          )}

          {/* Display for export complete */}
          {clientState === "export_complete" && taskDisplay && (
            <div class="mt-2 text-sm">
              <p>✅ {taskDisplay.filename || "文件"} 下载已开始。</p>
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
  );
}
