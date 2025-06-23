import type { GalleryImageItem } from "../lib/types.ts";

interface GalleryItemProps {
  image: GalleryImageItem;
  onImageClick: (image: GalleryImageItem) => void;
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

export default function GalleryItem(
  { image, onImageClick, getProxyUrl }: GalleryItemProps,
) {
  return (
    <div class="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-1">      <div
        class="gallery-image-container w-full flex items-center justify-center overflow-hidden rounded-t-lg relative transition-all duration-200 cursor-pointer group hover:shadow-lg"
        onClick={() => onImageClick(image)}
        title={`点击查看 "${image.title || "无标题图像"}"`}
      >        
        <img
          src={getProxyUrl(image.encodings?.thumbnail?.path || image.url)}
          alt={image.title || "无标题图像"}
          class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            // If thumbnail fails to load, fallback to original image
            const imgElement = e.currentTarget as HTMLImageElement;
            if (imgElement.src !== getProxyUrl(image.url)) {
              console.log(`Thumbnail failed to load, falling back to original for ${image.id}`);
              imgElement.src = getProxyUrl(image.url);
            }
          }}
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

export type { GalleryImageItem };
