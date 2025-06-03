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
      const url = new URL("/api/images", window.location.origin);
      url.searchParams.set("limit", batchSize.toString());
      
      if (!reset && cursor) {
        url.searchParams.set("after", cursor);
      }

      const headers: Record<string, string> = { 
        "x-api-token": apiToken
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
        setImages(prev => [...prev, ...(data.items || [])]);
      }
      
      setCursor(data.cursor || null);
      setHasMore(!!data.cursor);
      
    } catch (error) {
      console.error("Error loading images:", error);
      setError(error.message || "Failed to load images");
    } finally {
      setLoading(false);
    }
  };

  const resetModalState = (isLoading = true) => {
    const modalContainer = document.getElementById("modalImageContainer");
    const modalImage = document.getElementById("modalImage") as HTMLImageElement;
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

  const openModal = (imageSrc: string, imageTitle: string, width?: number, height?: number) => {
    const modal = document.getElementById("imageModal");
    const modalImage = document.getElementById("modalImage") as HTMLImageElement;
    const modalTitle = document.getElementById("modalTitle");
    const modalContainer = document.getElementById("modalImageContainer");
    const loadingText = document.getElementById("modalLoadingText");
    const errorText = document.getElementById("modalErrorText");

    if (!modal || !modalImage || !modalContainer) return;

    // Calculate container dimensions based on image aspect ratio and viewport
    const maxWidth = Math.min(window.innerWidth * 0.9, 1200);
    const maxHeight = Math.min(window.innerHeight * 0.9, 800);
    
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
        errorText.textContent = "Failed to load image";
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
      console.log("Settings saved, reloading images...");
      setCursor(null);
      setHasMore(true);
      setError(null);
      loadImages(true);
    };

    const handleDataCleared = () => {
      console.log("Data cleared, refreshing gallery...");
      setImages([]);
      setCursor(null);
      setHasMore(true);
      if (apiToken) {
        loadImages(true);
      }
    };

    window.addEventListener("settingsSaved", handleSettingsSaved);
    window.addEventListener("dataCleared", handleDataCleared);
    
    // Initial load
    if (apiToken) {
      loadImages(true);
    }

    return () => {
      window.removeEventListener("settingsSaved", handleSettingsSaved);
      window.removeEventListener("dataCleared", handleDataCleared);
    };
  }, [apiToken, teamId]);

  useEffect(() => {
    // Modal event listeners
    const modal = document.getElementById("imageModal");
    const closeModalBtn = document.getElementById("closeModal");
    const downloadBtn = document.getElementById("downloadImage");
    const modalImage = document.getElementById("modalImage") as HTMLImageElement;

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
        
        const a = document.createElement('a');
        a.href = url;
        a.download = modalImage.alt || 'image.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Download failed:', error);
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
        <p class="text-red-800 dark:text-red-200 font-medium mb-2">Error loading images</p>
        <p class="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
        <button
          onClick={() => loadImages(true)}
          class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (images.length === 0 && !loading) {
    return (
      <div class="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center text-gray-600 dark:text-gray-400">
        {apiToken
          ? "No images found."
          : "Enter your API token to view your images"}
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
                openModal(image.url, image.title || "Untitled image", image.width, image.height)}
            >
              <img
                src={image.encodings.thumbnail.path || image.url}
                alt={image.title || "Untitled image"}
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div class="p-4">
              <h3 class="font-medium text-gray-800 dark:text-gray-200 mb-1 truncate">
                {image.title || "Untitled image"}
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
          <p class="mt-2 text-gray-600 dark:text-gray-400">Loading images...</p>
        </div>
      )}

      {hasMore && !loading && images.length > 0 && (
        <div class="text-center py-4">
          <button
            onClick={() => loadImages(false)}
            class="bg-primary text-white px-6 py-2 rounded hover:bg-primaryDark transition-colors"
          >
            Load More Images
          </button>
        </div>
      )}

      {images.length > 0 && (
        <div class="text-center py-4 text-gray-600 dark:text-gray-400">
          <p>{images.length} images loaded</p>
        </div>
      )}
    </>
  );
}
