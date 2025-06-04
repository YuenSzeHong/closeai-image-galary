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

interface GalleryItemProps {
  image: ImageItem;
  onImageClick: (image: ImageItem) => void;
  getProxyUrl: (url: string) => string;
}

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

export default function GalleryItem({ image, onImageClick, getProxyUrl }: GalleryItemProps) {
  return (
    <div class="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
      <div
        class="gallery-image-container w-full flex items-center justify-center overflow-hidden rounded-t-lg relative transition-all duration-200 cursor-pointer group hover:shadow-lg"
        onClick={() => onImageClick(image)}
        title={`点击查看 "${image.title || "无标题图像"}"`}
      >
        <img
          src={getProxyUrl(image.encodings.thumbnail.path || image.url)}
          alt={image.title || "无标题图像"}
          class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div class="p-4">
        <h3 
          class="font-medium text-gray-800 dark:text-gray-200 mb-1 truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          onClick={() => onImageClick(image)}
          title={image.title || "无标题图像"}
        >
          {image.title || "无标题图像"}
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {formatDate(image.created_at)}
        </p>
        <div class="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>{image.width} × {image.height}</span>
          <span>ID: {image.id.slice(-8)}</span>
        </div>
      </div>
    </div>
  );
}

export type { ImageItem };
