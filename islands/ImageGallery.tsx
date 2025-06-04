import { useEffect, useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";

interface ImageItem {
  id: string;
  url: string;
  originalUrl?: string;
  width: number;
  height: number;
  title: string;
  created_at: number;
  metadata?: any;
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
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [apiToken] = useLocalStorage<string>("chatgpt_api_token", "");
  const [teamId] = useLocalStorage<string>("chatgpt_team_id", "personal");
  const [batchSize] = useLocalStorage<number>("chatgpt_batch_size", 50);

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
      url.searchParams.set("limit", batchSize.toString());

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

      setCursor(data.cursor || null);
      setHasMore(!!data.cursor);
    } catch (error) {
      console.error("加载图像时出错:", error);
      setError((error as Error).message || "加载图像失败");
    } finally {
      setLoading(false);
    }
  };

  const resetModalState = (isLoading = true) => {
    const modalContainer = document.getElementById("modalImageContainer");
    const modalImage = document.getElementById(
      "modalImage",
    ) as HTMLImageElement;
    const loadingText = document.getElementById("modalLoadingText");
    const errorText = document.getElementById("modalErrorText");

    if (!modalContainer || !modalImage) return;

    modalImage.style.opacity = "0";
    modalImage.src = "";

    if (isLoading) {
      modalContainer.classList.add("animate-pulse");

      if (loadingText) {
        loadingText.classList.remove("hidden");
      }

      if (errorText) {
        errorText.classList.add("hidden");
      }
    }
  };

  const openModal = (
    imageSrc: string,
    imageTitle: string,
    width?: number,
    height?: number,
  ) => {
    const modal = document.getElementById("imageModal");
    const modalImage = document.getElementById(
      "modalImage",
    ) as HTMLImageElement;
    const modalTitle = document.getElementById("modalTitle");
    const modalContainer = document.getElementById("modalImageContainer");
    const loadingText = document.getElementById("modalLoadingText");
    const errorText = document.getElementById("modalErrorText");

    if (!modal || !modalImage || !modalContainer) return;

    // Calculate container dimensions based on image aspect ratio and viewport
    const maxWidth = Math.min(globalThis.innerWidth * 0.9, 1200);
    const maxHeight = Math.min(globalThis.innerHeight * 0.9, 800);

    let containerWidth = maxWidth;
    let containerHeight = maxHeight;

    if (width && height) {
      const aspectRatio = width / height;
      if (aspectRatio > maxWidth / maxHeight) {
        // Image is wider - fit to width
        containerWidth = maxWidth;
        containerHeight = maxWidth / aspectRatio;
      } else {
        // Image is taller - fit to height
        containerHeight = maxHeight;
        containerWidth = maxHeight * aspectRatio;
      }
    }

    // Set container dimensions to prevent layout shift
    modalContainer.style.width = `${containerWidth}px`;
    modalContainer.style.height = `${containerHeight}px`;

    // Reset modal state and prepare for loading
    resetModalState(true);
    modalImage.style.width = `${containerWidth}px`;
    modalImage.style.height = `${containerHeight}px`;

    // Set title
    if (modalTitle) modalTitle.textContent = imageTitle;

    // Show modal first
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    // Setup image load handler
    const handleImageLoad = () => {
      modalContainer.classList.remove("animate-pulse");
      if (loadingText) loadingText.classList.add("hidden");
      modalImage.style.opacity = "1";
    };

    const handleImageError = () => {
      modalContainer.classList.remove("animate-pulse");
      if (loadingText) loadingText.classList.add("hidden");
      if (errorText) {
        errorText.textContent = "图像加载失败";
        errorText.classList.remove("hidden");
      }
    };

    // Add event listeners
    modalImage.addEventListener("load", handleImageLoad, { once: true });
    modalImage.addEventListener("error", handleImageError, { once: true });

    // Start loading image
    modalImage.src = imageSrc;
    modalImage.alt = imageTitle;
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

  useEffect(() => {
    // Modal event listeners
    const modal = document.getElementById("imageModal");
    const closeModalBtn = document.getElementById("closeModal");
    const downloadBtn = document.getElementById("downloadImage");
    const modalImage = document.getElementById(
      "modalImage",
    ) as HTMLImageElement;

    const closeModal = () => {
      if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");

        // Reset modal state using the shared function
        resetModalState(false);

        // Reset container dimensions to default
        const modalContainer = document.getElementById("modalImageContainer");
        if (modalContainer) {
          modalContainer.style.width = "400px";
          modalContainer.style.height = "400px";
        }
      }
    };

    const handleDownload = async () => {
      if (!modalImage.src) return;

      try {
        const response = await fetch(modalImage.src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = modalImage.alt || "image.jpg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("下载失败:", error);
      }
    };

    const handleModalClick = (e: Event) => {
      if (e.target === modal) closeModal();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
        closeModal();
      }
    };

    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (downloadBtn) downloadBtn.addEventListener("click", handleDownload);
    if (modal) modal.addEventListener("click", handleModalClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (closeModalBtn) closeModalBtn.removeEventListener("click", closeModal);
      if (downloadBtn) downloadBtn.removeEventListener("click", handleDownload);
      if (modal) modal.removeEventListener("click", handleModalClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
              onClick={() =>
                openModal(
                  image.url,
                  image.title || "无标题图像",
                  image.width,
                  image.height,
                )}
            >
              <img
                src={image.encodings.thumbnail.path || image.url}
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
        <div class="text-center py-8">
          <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent">
          </div>
          <p class="mt-2 text-gray-600 dark:text-gray-400">正在加载图像...</p>
        </div>
      )}

      {hasMore && !loading && images.length > 0 && (
        <div class="text-center py-4">
          <button
            type="button"
            onClick={() => loadImages(false)}
            class="bg-primary text-white px-6 py-2 rounded hover:bg-primaryDark transition-colors"
          >
            加载更多图像
          </button>
        </div>
      )}

      {images.length > 0 && (
        <div class="text-center py-4 text-gray-600 dark:text-gray-400">
          <p>{images.length} 张图像已加载</p>
        </div>
      )}
    </>
  );
}
