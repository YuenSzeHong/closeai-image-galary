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
  
  const [apiToken] = useLocalStorage<string>("chatgpt_api_token", "");
  const [teamId] = useLocalStorage<string>("chatgpt_team_id", "");
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
    try {
      const url = new URL("/api/images", window.location.origin);
      if (!reset && cursor) url.searchParams.set("after", cursor);
      url.searchParams.set("limit", batchSize.toString());

      const headers: Record<string, string> = { "x-api-token": apiToken };
      if (teamId && teamId.trim() !== "") headers["x-team-id"] = teamId;

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
      console.error("Error loading images:", error);
      // Show error in UI
    } finally {
      setLoading(false);
    }
  };

  const openModal = (imageSrc: string, imageTitle: string) => {
    const modal = document.getElementById("imageModal");
    const modalImage = document.getElementById(
      "modalImage",
    ) as HTMLImageElement;
    const modalTitle = document.getElementById("modalTitle");

    if (modalImage) {
      modalImage.src = imageSrc;
      modalImage.alt = imageTitle;
    }
    if (modalTitle) modalTitle.textContent = imageTitle;
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  };

  useEffect(() => {
    loadImages(true);

    // Listen for settings changes
    const handleSettingsSaved = () => {
      setCursor(null);
      setHasMore(true);
      loadImages(true);
    };

    window.addEventListener("settingsSaved", handleSettingsSaved);
    return () =>
      window.removeEventListener("settingsSaved", handleSettingsSaved);
  }, []);

  useEffect(() => {
    // Modal event listeners
    const modal = document.getElementById("imageModal");
    const closeModalBtn = document.getElementById("closeModal");

    const closeModal = () => {
      if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
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
    if (modal) modal.addEventListener("click", handleModalClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (closeModalBtn) closeModalBtn.removeEventListener("click", closeModal);
      if (modal) modal.removeEventListener("click", handleModalClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
              class="gallery-image-container cursor-pointer"
              onClick={() =>
                openModal(image.url, image.title || "Untitled image")}
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
