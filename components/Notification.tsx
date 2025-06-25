import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

interface NotificationProps {
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
  onClose: () => void;
}

export default function Notification(
  { message, type, duration = 3000, onClose }: NotificationProps,
) {
  const isVisible = useSignal(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      isVisible.value = false;
      setTimeout(onClose, 300); // Wait for animation to complete
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getTypeClasses = () => {
    switch (type) {
      case "success":
        return "bg-green-500 text-white border-green-600";
      case "error":
        return "bg-red-500 text-white border-red-600";
      case "info":
      default:
        return "bg-blue-500 text-white border-blue-600";
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "info":
      default:
        return "ℹ️";
    }
  };

  return (
    <div
      class={`fixed top-4 right-4 z-50 max-w-sm w-full shadow-lg rounded-lg border-l-4 p-4 transition-all duration-300 ${
        isVisible.value
          ? "translate-x-0 opacity-100"
          : "translate-x-full opacity-0"
      } ${getTypeClasses()}`}
    >
      <div class="flex items-center gap-3">
        <span class="text-lg">{getIcon()}</span>
        <div class="flex-1">
          <p class="font-medium">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            isVisible.value = false;
            setTimeout(onClose, 300);
          }}
          class="text-white/80 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
