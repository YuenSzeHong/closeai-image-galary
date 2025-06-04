import { useEffect, useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import ImageModal from "./ImageModal.tsx";
import GalleryItem, { type ImageItem } from "../components/GalleryItem.tsx";
import SettingsPanel from "../components/SettingsPanel.tsx";
import ZipExport from "./ZipExport.tsx";

interface GalleryResponse {
  items: ImageItem[];
  cursor?: string;
}

// Add function to transform raw ChatGPT API response to our format
const transformChatGPTResponse = (rawData: any): GalleryResponse => {
  const items: ImageItem[] = (rawData.items || []).map((item: any) => {
    return {
      id: item.id,
      url: item.url, // Keep original URL
      originalUrl: item.url,
      width: item.width,
      height: item.height,
      title: item.title,
      created_at: item.created_at,
      // Store the complete raw metadata from ChatGPT
      metadata: item, // Pass the entire raw response
      encodings: {
        thumbnail: {
          path: item.encodings?.thumbnail?.path || "", // Keep original thumbnail URL
          originalPath: item.encodings?.thumbnail?.path,
        },
      },
    };
  });
  return { items, cursor: rawData.cursor };
};

export default function ImageGallery() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageMetadata, setSelectedImageMetadata] = useState<Record<string, unknown> | null>(null);
  const [loadingStats, setLoadingStats] = useState<{
    totalBatches: number;
    totalImages: number;
    failedBatches: number;
  }>({ totalBatches: 0, totalImages: 0, failedBatches: 0 });
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentModalImage, setCurrentModalImage] = useState<{
    src: string;
    alt: string;
    title: string;
  } | null>(null);

  const [apiToken] = useLocalStorage<string>("chatgpt_api_token", "");
  const [teamId] = useLocalStorage<string>("chatgpt_team_id", "personal");
  const [batchSize] = useLocalStorage<number>("chatgpt_batch_size", 50);

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

  const fetchSingleBatch = async (
    afterCursor?: string,
    limit?: number
  ): Promise<GalleryResponse> => {
    const url = new URL("/api/images", globalThis.location.origin);
    
    if (afterCursor) {
      url.searchParams.set("after", afterCursor);
    }
    if (limit) {
      url.searchParams.set("limit", limit.toString());
    }

    const headers: Record<string, string> = {
      "x-api-token": apiToken,
    };

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

    const rawData = await response.json();
    
    // Transform the raw ChatGPT API response to our format
    return transformChatGPTResponse(rawData);
  };

  const loadAllImages = async (reset = false) => {
    if (!apiToken) {
      setImages([]);
      return;
    }

    // Emit loading start event
    globalThis.dispatchEvent(new CustomEvent("loadingStart"));
    
    setLoading(true);
    setError(null);

    if (reset) {
      setCursor(null);
      setHasMore(true);
      setImages([]);
      setLoadingStats({ totalBatches: 0, totalImages: 0, failedBatches: 0 });
    }

    try {
      const allImages: ImageItem[] = reset ? [] : [...images];
      let currentCursor = reset ? null : cursor;
      let batchCount = 0;
      let failedCount = 0;
      let consecutiveEmptyBatches = 0;
      const maxBatches = 100;
      const maxRetries = 3;
      const maxConsecutiveEmpty = 2;

      while (batchCount < maxBatches && (reset || hasMore)) {
        let retryCount = 0;
        let batchSuccess = false;
        let currentBatch: GalleryResponse | null = null;

        // Emit progress update
        globalThis.dispatchEvent(new CustomEvent("progressUpdate", {
          detail: {
            isLoading: true,
            totalBatches: batchCount,
            totalImages: allImages.length,
            failedBatches: failedCount,
            currentStatus: `正在加载第 ${batchCount + 1} 批图像...`
          }
        }));

        while (retryCount < maxRetries && !batchSuccess) {
          try {
            currentBatch = await fetchSingleBatch(currentCursor || undefined, batchSize);
            batchSuccess = true;
            consecutiveEmptyBatches = 0;
            
          } catch (error) {
            retryCount++;
            console.warn(`Batch ${batchCount + 1} attempt ${retryCount} failed:`, error);
            
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            } else {
              failedCount++;
              console.error(`Batch ${batchCount + 1} failed after ${maxRetries} retries`);
              
              if (allImages.length > 0) {
                console.warn(`Continuing with ${allImages.length} images despite failed batch`);
                setHasMore(false);
                break;
              } else {
                throw error;
              }
            }
          }
        }

        if (!batchSuccess && allImages.length === 0) {
          throw new Error("Failed to fetch any batches");
        }

        if (!batchSuccess) {
          break;
        }

        if (currentBatch) {
          batchCount++;

          if (!currentBatch.items || currentBatch.items.length === 0) {
            consecutiveEmptyBatches++;
            console.log(`Empty batch ${batchCount}, consecutive empty: ${consecutiveEmptyBatches}`);
            
            if (consecutiveEmptyBatches >= maxConsecutiveEmpty) {
              console.log("Reached end of images (consecutive empty batches)");
              setHasMore(false);
              setCursor(null);
              break;
            }
          } else {
            const newImages = currentBatch.items.filter(
              newImg => !allImages.some(existingImg => existingImg.id === newImg.id)
            );
            
            if (newImages.length === 0 && currentBatch.items.length > 0) {
              consecutiveEmptyBatches++;
              console.log("No new images after deduplication");
            } else {
              allImages.push(...newImages);
              consecutiveEmptyBatches = 0;
            }
          }

          const newStats = {
            totalBatches: batchCount,
            totalImages: allImages.length,
            failedBatches: failedCount
          };
          
          setLoadingStats(newStats);
          setImages([...allImages]);

          // Emit progress update with current stats
          globalThis.dispatchEvent(new CustomEvent("progressUpdate", {
            detail: {
              isLoading: true,
              ...newStats,
              currentStatus: `已加载 ${allImages.length} 张图像 (${batchCount} 批次)`
            }
          }));

          if (!currentBatch.cursor) {
            console.log("No cursor returned, reached end of images");
            setHasMore(false);
            setCursor(null);
            break;
          }
          
          currentCursor = currentBatch.cursor;
          setCursor(currentCursor);
          
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      if (batchCount >= maxBatches) {
        console.warn(`Reached maximum batch limit (${maxBatches}), loaded ${allImages.length} images`);
        setHasMore(false);
      }

      setImages(allImages);

    } catch (error) {
      console.error("加载图像时出错:", error);
      setError((error as Error).message || "加载图像失败");
      setHasMore(false);
    } finally {
      setLoading(false);
      // Emit loading complete event
      globalThis.dispatchEvent(new CustomEvent("loadingComplete"));
    }
  };

  const openModal = (image: ImageItem) => {
    console.log("Opening modal for image:", image.id);
    
    // Use the original full-size image URL instead of thumbnail
    const fullImageUrl = image.url || image.originalUrl || "";
    
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

  const handleDownload = async () => {
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
  };

  useEffect(() => {
    // Listen for settings changes
    const handleSettingsSaved = () => {
      console.log("设置已保存，重新加载图像...");
      loadAllImages(true);
    };

    const handleDataCleared = () => {
      console.log("数据已清除，刷新图库...");
      setImages([]);
      setCursor(null);
      setHasMore(true);
      setLoadingStats({ totalBatches: 0, totalImages: 0, failedBatches: 0 });
      if (apiToken) {
        loadAllImages(true);
      }
    };

    globalThis.addEventListener("settingsSaved", handleSettingsSaved);
    globalThis.addEventListener("dataCleared", handleDataCleared);

    // Initial load
    if (apiToken) {
      loadAllImages(true);
    }

    return () => {
      globalThis.removeEventListener("settingsSaved", handleSettingsSaved);
      globalThis.removeEventListener("dataCleared", handleDataCleared);
    };
  }, [apiToken, teamId, batchSize]);

  if (error) {
    return (
      <div class="col-span-full bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
        <p class="text-red-800 dark:text-red-200 font-medium mb-2">
          加载图像时出错
        </p>
        <p class="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
        <div class="space-x-4">
          <button
            type="button"
            onClick={() => loadAllImages(true)}
            class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
          >
            重新开始
          </button>
          {cursor && (
            <button
              type="button"
              onClick={() => loadAllImages(false)}
              class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              继续加载
            </button>
          )}
        </div>
      </div>
    );
  }

  if (images.length === 0 && !loading) {
    return (
      <div class="space-y-6">
        {!apiToken && <SettingsPanel />}
        <div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">
          {apiToken ? "未找到图像。" : "配置访问令牌后即可查看您的图像"}
        </div>
      </div>
    );
  }
  return (
    <>
      {/* Add top padding to account for progress bar */}
      <div class="pt-20">
        {/* Gallery Controls Panel */}
        {images.length > 0 && apiToken && (
          <div class="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div class="flex items-center gap-4">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                  图像库管理
                </h3>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {images.length} 张图像
                </span>
              </div>
              <div class="flex-shrink-0">
                <ZipExport />
              </div>
            </div>
          </div>
        )}

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {images.map((image) => (
            <GalleryItem
              key={image.id}
              image={image}
              onImageClick={openModal}
              getProxyUrl={getProxyUrl}
            />
          ))}
        </div>

        {loading && (
          <div class="col-span-full text-center py-8">
            <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent">
            </div>
            <div class="mt-4 space-y-2">
              <p class="text-gray-600 dark:text-gray-400">正在加载图像...</p>
              {loadingStats.totalBatches > 0 && (
                <div class="text-sm text-gray-500 dark:text-gray-500">
                  <p>已处理批次: {loadingStats.totalBatches} | 已加载图像: {loadingStats.totalImages}</p>
                  {loadingStats.failedBatches > 0 && (
                    <p class="text-orange-600">失败批次: {loadingStats.failedBatches}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {images.length > 0 && !loading && (
          <div class="col-span-full text-center py-4 text-gray-600 dark:text-gray-400">
            <p>{images.length} 张图像已加载</p>
            {loadingStats.failedBatches > 0 && (
              <p class="text-orange-600 text-sm mt-1">
                {loadingStats.failedBatches} 个批次加载失败
              </p>
            )}
            {hasMore && (
              <button
                type="button"
                onClick={() => loadAllImages(false)}
                class="mt-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                加载更多
              </button>
            )}
          </div>
        )}
      </div>

      <ImageModal 
        metadata={selectedImageMetadata}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCurrentModalImage(null);
          setSelectedImageMetadata(null);
        }}
        onDownload={handleDownload}
        currentImage={currentModalImage}
      />
    </>
  );
}
