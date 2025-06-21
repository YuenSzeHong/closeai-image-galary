import { useEffect, useState } from "preact/hooks";
import Notification from "../components/Notification.tsx";

// Extend global type
declare global {
  interface Window {
    showNotification?: (
      message: string,
      type?: "success" | "error" | "info",
      duration?: number,
    ) => void;
  }
  
  // eslint-disable-next-line no-var
  var showNotification: ((
    message: string,
    type?: "success" | "error" | "info",
    duration?: number,
  ) => void) | undefined;
}

interface NotificationItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
}

export default function NotificationManager() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    // Global notification function
    globalThis.showNotification = (
      message: string,
      type: "success" | "error" | "info" = "info",
      duration?: number,
    ) => {
      const id = Date.now().toString();
      setNotifications((prev) => [...prev, { id, message, type, duration }]);
    };

    // Listen for export events
    const handleExportStart = () => {
      globalThis.showNotification?.("开始导出图像...", "info");
    };

    const handleExportSuccess = (event: Event) => {
      const customEvent = event as CustomEvent;
      const filename = customEvent.detail?.filename || "chatgpt_images.zip";
      globalThis.showNotification?.(`导出成功: ${filename}`, "success", 5000);
    };

    const handleExportError = (event: Event) => {
      const customEvent = event as CustomEvent;
      const error = customEvent.detail?.error || "导出失败";
      globalThis.showNotification?.(`导出错误: ${error}`, "error", 5000);
    };

    globalThis.addEventListener("exportStart", handleExportStart as EventListener);
    globalThis.addEventListener("exportSuccess", handleExportSuccess as EventListener);
    globalThis.addEventListener("exportError", handleExportError as EventListener);

    return () => {
      globalThis.removeEventListener("exportStart", handleExportStart as EventListener);
      globalThis.removeEventListener("exportSuccess", handleExportSuccess as EventListener);
      globalThis.removeEventListener("exportError", handleExportError as EventListener);
      globalThis.showNotification = undefined;
    };
  }, []);

  const removeNotification = (id: string) => {
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id)
    );
  };

  return (
    <div class="fixed top-0 right-0 z-50 p-4 space-y-2">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          duration={notification.duration}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}
