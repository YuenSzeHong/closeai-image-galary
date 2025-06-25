import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

interface ImageModalProps {
  metadata?: Record<string, unknown> | null;
  isOpen?: boolean;
  onClose?: () => void;
  onDownload?: () => void;
  onToggleMetadata?: () => void;
  currentImage?: {
    src: string;
    alt: string;
    title: string;
  } | null;
  isMetadataPanelOpen?: boolean;
}

export default function ImageModal({
  metadata,
  isOpen = false,
  onClose,
  onDownload,
  onToggleMetadata,
  currentImage,
  isMetadataPanelOpen = false,
}: ImageModalProps) {
  const imageLoading = useSignal(false);
  const imageError = useSignal(false);

  // Reset image loading state when currentImage changes
  useEffect(() => {
    if (currentImage?.src) {
      imageLoading.value = true;
      imageError.value = false;
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
      <div class="border-b border-border pb-2">
        <div class="text-muted-foreground font-medium text-xs uppercase tracking-wide mb-1">
          {field.label}
        </div>
        <div class="text-foreground text-sm break-words">
          {isUrl
            ? (
              <a
                href={field.value as string}
                target="_blank"
                class="text-primary hover:text-primary/80 break-all"
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
    const encodings = metadata.encodings as
      | { thumbnail?: { path?: string } }
      | undefined;

    const fields = [
      { key: "id", label: "图像ID", value: metadata.id },
      { key: "title", label: "标题", value: metadata.title },
      { key: "source", label: "来源", value: metadata.source },
      {
        key: "generation_type",
        label: "生成类型",
        value: metadata.generation_type,
      },
      { key: "width", label: "宽度", value: metadata.width },
      { key: "height", label: "高度", value: metadata.height },
      { key: "created_at", label: "创建时间", value: metadata.created_at },
      { key: "prompt", label: "提示词", value: metadata.prompt },
      {
        key: "conversation_id",
        label: "对话ID",
        value: metadata.conversation_id,
      },
      { key: "message_id", label: "消息ID", value: metadata.message_id },
      { key: "generation_id", label: "生成ID", value: metadata.generation_id },
      {
        key: "transformation_id",
        label: "转换ID",
        value: metadata.transformation_id,
      },
      {
        key: "asset_pointer",
        label: "资源指针",
        value: metadata.asset_pointer,
      },
      {
        key: "output_blocked",
        label: "输出被阻止",
        value: metadata.output_blocked,
      },
      { key: "is_archived", label: "已归档", value: metadata.is_archived },
      { key: "tags", label: "标签", value: metadata.tags },
      { key: "url", label: "原始URL", value: metadata.url },
      {
        key: "thumbnail",
        label: "缩略图URL",
        value: encodings?.thumbnail?.path,
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
      class={`fixed inset-0 bg-background/80 backdrop-blur-sm z-50 ${
        isOpen ? "flex" : "hidden"
      } items-center justify-center p-4`}
      onClick={handleModalClick}
    >
      <div class="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
        <button
          type="button"
          title="关闭弹窗 (ESC)"
          class="absolute -top-12 right-0 text-foreground text-3xl font-bold hover:text-muted-foreground transition-colors z-30"
          onClick={onClose}
        >
          &times;
        </button>

        <button
          type="button"
          title="显示/隐藏元数据"
          class="absolute -top-12 right-12 text-foreground hover:text-muted-foreground transition-colors cursor-pointer p-2 rounded-md hover:bg-muted/30 z-30 flex items-center"
          onClick={onToggleMetadata}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          元数据
        </button>

        <button
          type="button"
          title="下载图片"
          class="absolute -top-12 left-0 text-foreground hover:text-muted-foreground transition-colors cursor-pointer p-2 rounded-md hover:bg-muted/30 z-30 flex items-center"
          onClick={onDownload}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 mr-1"
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
          下载
        </button>

        {/* Image container */}
        <div
          id="modalImageContainer"
          class="relative flex items-center justify-center min-w-[200px] min-h-[200px] max-w-[90vw] max-h-[90vh]"
        >
          {currentImage
            ? (
              <>
                {imageLoading && (
                  <div class="absolute inset-0 bg-muted rounded animate-pulse flex items-center justify-center">
                    <div class="text-muted-foreground text-lg font-medium">
                      加载中...
                    </div>
                  </div>
                )}
                {imageError && (
                  <div class="absolute inset-0 bg-muted rounded flex items-center justify-center">
                    <div class="text-destructive text-lg font-medium">
                      图片加载失败
                    </div>
                  </div>
                )}
                <img
                  id="modalImage"
                  class={`w-full h-full object-contain rounded transition-opacity duration-300 ${
                    imageLoading ? "opacity-0" : "opacity-100"
                  }`}
                  src={currentImage.src}
                  alt={currentImage.alt}
                  style="max-width: 90vw; max-height: 90vh;"
                  onLoad={() => {
                    imageLoading.value = false;
                    imageError.value = false;
                  }}
                  onError={() => {
                    imageLoading.value = false;
                    imageError.value = true;
                  }}
                />
                <div
                  id="modalTitle"
                  class="absolute -bottom-12 left-0 right-0 text-foreground text-base p-2 bg-background/50 rounded text-center"
                >
                  {currentImage.title}
                </div>
              </>
            )
            : (
              <div class="bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex items-center justify-center w-96 h-96">
                <div class="text-gray-600 dark:text-gray-400 text-lg font-medium">
                  选择图像查看
                </div>
              </div>
            )}
        </div>{" "}
        {/* Metadata Panel */}
        <div
          id="metadataPanel"
          class={`absolute top-0 right-0 h-full w-96 bg-popover backdrop-blur-sm border-l border-border ${
            isMetadataPanelOpen ? "" : "hidden"
          } overflow-y-auto z-40`}
        >
          <div class="p-4">
            <h3 class="text-foreground text-lg font-semibold mb-4 border-b border-border pb-2">
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
                : <div class="text-muted-foreground">选择图像以查看元数据</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
