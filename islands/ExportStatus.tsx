import { useState, useEffect } from "preact/hooks";

export default function ExportStatus() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    const handleExportStart = () => {
      setIsExporting(true);
      setExportMessage("正在导出图像...");
    };

    const handleExportSuccess = (event: CustomEvent) => {
      setIsExporting(false);
      const filename = event.detail?.filename || "chatgpt_images.zip";
      setExportMessage(`导出完成: ${filename}`);
      
      // Clear message after delay
      setTimeout(() => setExportMessage(""), 3000);
    };

    const handleExportError = (event: CustomEvent) => {
      setIsExporting(false);
      const error = event.detail?.error || "导出失败";
      setExportMessage(`导出失败: ${error}`);
      
      // Clear message after delay
      setTimeout(() => setExportMessage(""), 5000);
    };

    globalThis.addEventListener("exportStart", handleExportStart);
    globalThis.addEventListener("exportSuccess", handleExportSuccess);
    globalThis.addEventListener("exportError", handleExportError);

    return () => {
      globalThis.removeEventListener("exportStart", handleExportStart);
      globalThis.removeEventListener("exportSuccess", handleExportSuccess);
      globalThis.removeEventListener("exportError", handleExportError);
    };
  }, []);

  if (!isExporting && !exportMessage) {
    return null;
  }

  return (
    <div class="fixed bottom-4 left-4 z-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm">
      <div class="flex items-center gap-3">
        {isExporting && (
          <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        )}
        <div class="flex-1">
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            {exportMessage}
          </p>
          {isExporting && (
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              请稍候，正在处理您的图像...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
