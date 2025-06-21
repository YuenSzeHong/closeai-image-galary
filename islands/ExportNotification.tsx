// components/ExportNotification.tsx

import { useEffect, useState } from "preact/hooks";

interface ExportNotificationState {
  isVisible: boolean;
  message: string;
  type: "info" | "success" | "error" | "progress";
  progress?: number; // Not used in this version but kept for potential future use
}

/**
 * A small, transient notification component, typically for corner-based alerts.
 * This component listens to global custom events (`exportStart`, `exportReady`, etc.)
 * to display brief messages to the user. It is separate from the main
 * ExportStatusDisplay which shows detailed progress.
 */
export default function ExportNotification() {
  const [state, setState] = useState<ExportNotificationState>({
    isVisible: false,
    message: "",
    type: "info",
  });

  useEffect(() => {
    // Event listeners for global export events
    const handleExportStart = () => {
      // This event might be too early if ExportStatusDisplay already shows "checking"
      setState({
        isVisible: true,
        message: "导出任务已启动...", // Adjusted message
        type: "progress",
      });
      // Auto-hide after a short delay
      setTimeout(() => setState((prev) => ({ ...prev, isVisible: false })), 3000);
    };

    const handleExportReady = (event: Event) => {
      const customEvent = event as CustomEvent;
      const filename = customEvent.detail?.filename || "文件";
      const totalImages = customEvent.detail?.totalImages || 0;

      // This could be a good final "ready" toast
      setState({
        isVisible: true,
        message: `文件准备就绪: ${filename} (${totalImages} 图片)`, // Adjusted message
        type: "success",
      });

      // Auto-hide after 5 seconds
      setTimeout(() => {
        setState((prev) => ({ ...prev, isVisible: false }));
      }, 5000);
    };

    const handleExportSuccess = (event: Event) => {
      const customEvent = event as CustomEvent;
      const filename = customEvent.detail?.filename || "文件";

      // This is a good place for a confirmation toast after download initiated
      setState({
        isVisible: true,
        message: `下载已开始: ${filename}`, // Adjusted message
        type: "success",
      });

      // Auto-hide after 3 seconds
      setTimeout(() => {
        setState((prev) => ({ ...prev, isVisible: false }));
      }, 3000);
    };

    const handleExportError = (event: Event) => {
      const customEvent = event as CustomEvent;
      const error = customEvent.detail?.error || "导出失败";

      // Always show error toasts
      setState({
        isVisible: true,
        message: `导出错误: ${error}`,
        type: "error",
      });

      // Auto-hide after 7 seconds for errors
      setTimeout(() => {
        setState((prev) => ({ ...prev, isVisible: false }));
      }, 7000);
    };

    globalThis.addEventListener("exportStart", handleExportStart);
    globalThis.addEventListener("exportReady", handleExportReady);
    globalThis.addEventListener("exportSuccess", handleExportSuccess);
    globalThis.addEventListener("exportError", handleExportError);

    return () => {
      globalThis.removeEventListener("exportStart", handleExportStart);
      globalThis.removeEventListener("exportReady", handleExportReady);
      globalThis.removeEventListener("exportSuccess", handleExportSuccess);
      globalThis.removeEventListener("exportError", handleExportError);
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  if (!state.isVisible) {
    return null;
  }

  // Helper function to get Tailwind CSS classes for styling based on notification type
  const getColorClasses = () => {
    switch (state.type) {
      case "success":
        return "bg-green-100 dark:bg-green-900 border-green-500 text-green-800 dark:text-green-200";
      case "error":
        return "bg-red-100 dark:bg-red-900 border-red-500 text-red-800 dark:text-red-200";
      case "progress":
        return "bg-blue-100 dark:bg-blue-900 border-blue-500 text-blue-800 dark:text-blue-200";
      default: // info
        return "bg-gray-100 dark:bg-gray-900 border-gray-500 text-gray-800 dark:text-gray-200";
    }
  };

  // Helper function to get emoji icon based on notification type
  const getIcon = () => {
    switch (state.type) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "progress":
        return "🔄";
      default: // info
        return "ℹ️";
    }
  };

  return (
    <div
      class={`fixed top-4 right-4 z-50 max-w-sm w-full shadow-lg rounded-lg border-l-4 p-4 transition-all duration-300 ${getColorClasses()}`}
    >
      <div class="flex items-center gap-3">
        <span class="text-lg">{getIcon()}</span>
        <div class="flex-1">
          <p class="font-medium text-sm">{state.message}</p>
        </div>
        <button
          type="button"
          onClick={() => setState((prev) => ({ ...prev, isVisible: false }))}
          class="text-current opacity-60 hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      </div>
    </div>
  );
}