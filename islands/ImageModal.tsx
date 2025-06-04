import { useEffect, useState } from "preact/hooks";

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
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "boolean") return value ? "是" : "否";
    if (typeof value === "number") {
      // Handle timestamps
      if (
        typeof value === "number" && value > 1000000000 && value < 10000000000
      ) {
        return new Date(value * 1000).toLocaleString();
      }
      return value.toString();
    }
    if (typeof value === "string") {
      // Handle URLs
      if (value.startsWith("http")) {
        return value;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.length > 0
        ? value.map((v) => formatValue(v)).join(", ")
        : "空数组";
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const renderMetadataField = (
    field: { key: string; label: string; value: unknown },
  ) => {
    const formattedValue = formatValue(field.value);
    const isUrl = typeof field.value === "string" &&
      field.value.startsWith("http");

    return (
      <div class="border-b border-gray-700 pb-2">
        <div class="text-gray-300 font-medium text-xs uppercase tracking-wide mb-1">
          {field.label}
        </div>
        <div class="text-white text-sm break-words">
          {isUrl
            ? (
              <a
                href={field.value as string}
                target="_blank"
                class="text-blue-400 hover:text-blue-300 break-all"
              >
                {formattedValue}
              </a>
            )
            : formattedValue}
        </div>
      </div>
    );
  };

  const getMetadataFields = () => {
    if (!metadata) {
      console.log("No metadata available");
      return [];
    }

    console.log("Metadata object:", metadata);

    // Show only the most important and user-relevant fields
    const fields = [
      { key: "title", label: "标题", value: metadata.title },
      { key: "prompt", label: "提示词", value: metadata.prompt },
      { key: "created_at", label: "创建时间", value: metadata.created_at },
      {
        key: "width",
        label: "尺寸",
        value: metadata.width && metadata.height
          ? `${metadata.width} × ${metadata.height}`
          : undefined,
      },
      { key: "source", label: "来源", value: metadata.source },
      {
        key: "generation_type",
        label: "类型",
        value: metadata.generation_type,
      },
    ].filter((field) =>
      field.value !== undefined && field.value !== null && field.value !== ""
    );

    console.log("Filtered metadata fields:", fields);
    return fields;
  };

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
      class={`fixed inset-0 bg-black/80 dark:bg-black/90 backdrop-blur-sm z-50 ${
        isOpen ? "flex" : "hidden"
      } items-center justify-center p-4`}
      onClick={handleModalClick}
    >
      <div class="relative flex bg-gray-900 rounded-lg overflow-hidden max-w-[95vw] max-h-[90vh]">
        {/* Control buttons */}
        <div class="absolute top-4 right-4 z-30 flex gap-2">
          <button
            type="button"
            title="下载图片"
            class="text-white hover:text-gray-300 transition-colors cursor-pointer p-2 rounded-md hover:bg-black/30 flex items-center"
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
          class="relative flex items-center justify-center bg-gray-100 dark:bg-gray-800"
          style={{
            width: "calc(95vw - 400px)",
            maxWidth: "calc(95vw - 400px)",
            height: "90vh",
            minWidth: "500px",
          }}
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
                <div
                  id="modalTitle"
                  class="absolute -bottom-12 left-0 right-0 text-white text-base p-2 bg-black/50 rounded text-center"
                >
                  {currentImage.title}
                </div>
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
          class="bg-gray-800 border-l border-gray-600 overflow-y-auto flex-shrink-0"
          style={{
            width: "400px",
            height: "90vh",
          }}
        >
          <div class="p-4">
            <h3 class="text-white text-lg font-semibold mb-4 border-b border-gray-600 pb-2">
              图像元数据
            </h3>
            <div class="space-y-3 text-sm">
              {metadata
                ? (
                  getMetadataFields().map((field, index) => (
                    <div key={index}>
                      {renderMetadataField(field)}
                    </div>
                  ))
                )
                : <div class="text-gray-400">选择图像以查看元数据</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
