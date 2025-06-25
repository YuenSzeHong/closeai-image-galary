import { useEffect, useState } from "preact/hooks";
import MetadataDisplay from "../components/MetadataDisplay.tsx";

interface ImageModalProps {
  metadata?: Record<string, unknown> | null;
  isOpen?: boolean;
  onClose?: () => void;
  onDownload?: () => void;
  currentImage?: {
    src: string;
    alt: string;
    title: string;
  } | null;
}

export default function ImageModal({
  metadata,
  isOpen = false,
  onClose,
  onDownload,
  currentImage,
}: ImageModalProps) {
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reset image loading state when currentImage changes
  useEffect(() => {
    if (currentImage?.src) {
      setImageLoading(true);
      setImageError(false);
    }
  }, [currentImage?.src]);

  // Handle keyboard events (ESC to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && onClose) {
        onClose();
      }
    };

    if (isOpen) {
      globalThis.addEventListener("keydown", handleKeyDown);
      return () => globalThis.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleModalClick = (e: Event) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <div
      id="imageModal"
      class={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 dark:bg-black/90 backdrop-blur-sm ${
        isOpen ? "flex" : "hidden"
      }`}
      onClick={handleModalClick}
      style={{ display: isOpen ? "flex" : "none" }}
    >
      <div class="relative max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] w-auto h-auto flex bg-gray-900 rounded-xl overflow-hidden shadow-2xl lg:flex-row flex-col lg:max-w-[95vw] lg:max-h-[95vh]">
        {/* Control buttons */}
        <div class="absolute top-4 right-4 z-30 flex gap-2">
          <button
            type="button"
            title="下载图片"
            class="text-white hover:text-gray-300 transition-colors p-2 rounded-md hover:bg-black/30 flex items-center"
            onClick={onDownload}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>

          <button
            type="button"
            title="关闭弹窗 (ESC)"
            class="text-white text-2xl font-bold hover:text-gray-300 transition-colors p-2 rounded-md hover:bg-black/30"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* Image container */}
        <div
          id="modalImageContainer"
          class="relative flex items-center justify-center bg-gray-100 dark:bg-gray-800 lg:w-[calc(100vw-450px)] lg:max-w-[calc(100vw-450px)] lg:h-[calc(100vh-4rem)] lg:min-w-[400px] w-full h-[60vh]"
        >
          {currentImage
            ? (
              <>
                {imageLoading && (
                  <div class="absolute inset-0 bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex items-center justify-center">
                    <div class="text-gray-600 dark:text-gray-400 text-lg font-medium">
                      加载中...
                    </div>
                  </div>
                )}
                {imageError && (
                  <div class="absolute inset-0 bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center">
                    <div class="text-red-500 text-lg font-medium">
                      图片加载失败
                    </div>
                  </div>
                )}
                <img
                  id="modalImage"
                  class={`max-w-full max-h-full object-contain transition-opacity duration-300 ${
                    imageLoading ? "opacity-0" : "opacity-100"
                  }`}
                  src={currentImage.src}
                  alt={currentImage.alt}
                  onLoad={() => {
                    setImageLoading(false);
                    setImageError(false);
                  }}
                  onError={() => {
                    setImageLoading(false);
                    setImageError(true);
                  }}
                />
              </>
            )
            : (
              <div class="bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex items-center justify-center w-full h-full">
                <div class="text-gray-600 dark:text-gray-400 text-lg font-medium">
                  选择图像查看
                </div>
              </div>
            )}
        </div>

        {/* Metadata Panel */}
        <div
          id="metadataPanel"
          class="bg-gray-800 border-l border-gray-600 overflow-y-auto flex-shrink-0 lg:w-[400px] lg:h-[calc(100vh-4rem)] w-full h-[35vh]"
        >
          <div class="p-4">
            <h3 class="text-white text-lg font-semibold mb-4 border-b border-gray-600 pb-2">
              图像元数据
            </h3>
            <MetadataDisplay metadata={metadata || null} />
          </div>
        </div>
      </div>
    </div>
  );
}
