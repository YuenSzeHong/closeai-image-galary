export default function ImageModal() {
  return (
    <div
      id="imageModal"
      class="fixed inset-0 bg-black/80 dark:bg-black/90 backdrop-blur-sm z-50 hidden items-center justify-center p-4"
    >
      <div class="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
        <button
          id="closeModal"
          type="button"
          title="关闭弹窗 (ESC)"
          class="absolute -top-12 right-0 text-white text-3xl font-bold hover:text-gray-300 transition-colors z-30"
        >
          &times;
        </button>
        <a
          id="downloadImage"
          title="下载图片"
          class="absolute -top-12 left-0 text-white hover:text-gray-300 transition-colors cursor-pointer p-2 rounded-md hover:bg-black/30 z-30 flex items-center"
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
        </a>

        {/* Loading placeholder with fixed dimensions */}
        <div
          id="modalImageContainer"
          class="relative bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex items-center justify-center transition-all duration-200 ease-in-out"
          style="width: 400px; height: 400px; min-width: 200px; min-height: 200px;"
        >
          <div
            id="modalLoadingText"
            class="text-gray-600 dark:text-gray-400 text-lg font-medium"
          >
            加载中...
          </div>
          <div
            id="modalErrorText"
            class="text-red-500 text-lg font-medium hidden"
          >
            图片加载失败
          </div>
        </div>

        <img
          id="modalImage"
          class="absolute inset-0 w-full h-full object-contain rounded transition-opacity duration-300 opacity-0"
          src=""
          alt=""
          style="max-width: 90vw; max-height: 90vh;"
          data-reset-state="true"
        />

        <div
          id="modalTitle"
          class="absolute -bottom-12 left-0 right-0 text-white text-base p-2 bg-black/50 rounded text-center"
        >
        </div>
      </div>
    </div>
  );
}
