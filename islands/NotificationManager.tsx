import { useState, useEffect } from "preact/hooks";
import Notification from "../components/Notification.tsx";

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
    globalThis.showNotification = (message: string, type: "success" | "error" | "info" = "info", duration?: number) => {
      const id = Date.now().toString();
      setNotifications(prev => [...prev, { id, message, type, duration }]);
    };

    // Listen for export events
    const handleExportStart = () => {
      globalThis.showNotification("开始导出图像...", "info");
    };

    const handleExportSuccess = (event: CustomEvent) => {
      const filename = event.detail?.filename || "chatgpt_images.zip";
      globalThis.showNotification(`导出成功: ${filename}`, "success", 5000);
    };

    const handleExportError = (event: CustomEvent) => {
      const error = event.detail?.error || "导出失败";
      globalThis.showNotification(`导出错误: ${error}`, "error", 5000);
    };

    globalThis.addEventListener("exportStart", handleExportStart);
    globalThis.addEventListener("exportSuccess", handleExportSuccess);
    globalThis.addEventListener("exportError", handleExportError);

    return () => {
      globalThis.removeEventListener("exportStart", handleExportStart);
      globalThis.removeEventListener("exportSuccess", handleExportSuccess);
      globalThis.removeEventListener("exportError", handleExportError);
      delete globalThis.showNotification;
    };
  }, []);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  return (
    <div class="fixed top-0 right-0 z-50 p-4 space-y-2">
      {notifications.map(notification => (
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
