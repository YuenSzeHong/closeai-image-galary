import { useEffect, useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import ImageModal from "./ImageModal.tsx";

interface ImageItem {
  id: string;
  url: string;
  originalUrl?: string;
  width: number;
  height: number;
  title: string;
  created_at: number;
  metadata?: Record<string, unknown>;
  encodings: {
    thumbnail: {
      path: string;
      originalPath?: string;
      blobUrl?: string;
    };
  };
}

export default function ImageGallery() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [_hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageMetadata, setSelectedImageMetadata] = useState<Record<string, unknown> | null>(null);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentModalImage, setCurrentModalImage] = useState<{
    src: string;
    alt: string;
    title: string;
  } | null>(null);

  const [apiToken] = useLocalStorage<string>("chatgpt_api_token", "");
  const [teamId] = useLocalStorage<string>("chatgpt_team_id", "personal");
  const [_batchSize] = useLocalStorage<number>("chatgpt_batch_size", 50);

  const getProxyUrl = (originalUrl: string) => {
    return `/api/proxy?url=${encodeURIComponent(originalUrl)}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const loadImages = async (reset = false) => {
    if (!apiToken) {
      setImages([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/images", globalThis.location.origin);
      url.searchParams.set("limit", "50"); // Reasonable batch size

      if (!reset && cursor) {
        url.searchParams.set("after", cursor);
      }

      const headers: Record<string, string> = {
        "x-api-token": apiToken,
      };

      // Only add team header if it's not "personal"
      if (teamId && teamId !== "personal") {
        headers["x-team-id"] = teamId;
      }

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: "Unknown API error",
        }));
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }

      const data = await response.json();
      
      if (reset) {
        setImages(data.items || []);
      } else {
        setImages((prev) => [...prev, ...(data.items || [])]);
      }

      setCursor(data.cursor);
      setHasMore(!!data.cursor);
    } catch (error) {
      console.error("加载图像时出错:", error);
      setError((error as Error).message || "加载图像失败");
    } finally {
      setLoading(false);
    }
  };



  const openModal = (image: ImageItem) => {
    console.log("Opening modal for image:", image.id);
    
    // Use the original full-size image URL instead of thumbnail
    const fullImageUrl = image.url || image.originalUrl;
    
    // Set the current image for the modal
    setCurrentModalImage({
      src: getProxyUrl(fullImageUrl),
      alt: image.title || "无标题图像",
      title: image.title || "无标题图像"
    });

    // Set metadata state for modal display
    console.log("Setting metadata for image:", image.id, image.metadata);
    setSelectedImageMetadata(image.metadata || null);

    // Open the modal
    setIsModalOpen(true);
  };

  useEffect(() => {
    // Listen for settings changes
    const handleSettingsSaved = () => {
      console.log("设置已保存，重新加载图像...");
      setCursor(null);
      setHasMore(true);
      setError(null);
      loadImages(true);
    };

    const handleDataCleared = () => {
      console.log("数据已清除，刷新图库...");
      setImages([]);
      setCursor(null);
      setHasMore(true);
      if (apiToken) {
        loadImages(true);
      }
    };

    globalThis.addEventListener("settingsSaved", handleSettingsSaved);
    globalThis.addEventListener("dataCleared", handleDataCleared);

    // Initial load
    if (apiToken) {
      loadImages(true);
    }

    return () => {
      globalThis.removeEventListener("settingsSaved", handleSettingsSaved);
      globalThis.removeEventListener("dataCleared", handleDataCleared);
    };
  }, [apiToken, teamId]);

  if (error) {
    return (
      <div class="col-span-full bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
        <p class="text-red-800 dark:text-red-200 font-medium mb-2">
          加载图像时出错
        </p>
        <p class="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>{" "}
        <button
          type="button"
          onClick={() => loadImages(true)}
          class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  if (images.length === 0 && !loading) {
    return (
      <div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">
        {apiToken ? "未找到图像。" : "输入您的 API 令牌以查看您的图像"}
      </div>
    );
  }

  return (
    <>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {images.map((image) => (
          <div
            key={image.id}
            class="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-md"
          >
            <div
              class="w-full aspect-[3/4] flex items-center justify-center overflow-hidden rounded cursor-pointer"
              onClick={() => openModal(image)}
            >
              <img
                src={getProxyUrl(image.encodings.thumbnail.path || image.url)}
                alt={image.title || "无标题图像"}
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div class="p-4">
              <h3 class="font-medium text-gray-800 dark:text-gray-200 mb-1 truncate">
                {image.title || "无标题图像"}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {formatDate(image.created_at)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div class="col-span-full text-center py-8">
          <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent">
          </div>
          <p class="mt-2 text-gray-600 dark:text-gray-400">正在加载图像...</p>
        </div>
      )}

      {!loading && _hasMore && images.length > 0 && (
        <div class="col-span-full text-center py-8">
          <button
            type="button"
            onClick={() => loadImages(false)}
            class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            加载更多图像
          </button>
        </div>
      )}

      {images.length > 0 && !_hasMore && (
        <div class="col-span-full text-center py-4 text-gray-600 dark:text-gray-400">
          <p>{images.length} 张图像已全部加载</p>
        </div>
      )}

      <ImageModal 
        metadata={selectedImageMetadata}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCurrentModalImage(null);
          setSelectedImageMetadata(null);
        }}
        onDownload={async () => {
          if (!currentModalImage?.src) return;
          try {
            const response = await fetch(currentModalImage.src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = currentModalImage.alt || "image.jpg";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } catch (error) {
            console.error("下载失败:", error);
          }
        }}
        currentImage={currentModalImage}
      />
    </>
  );
}
