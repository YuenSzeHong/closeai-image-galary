export default function ImageModal() {
  return (
    <div
      id="imageModal"
      class="fixed inset-0 bg-black bg-opacity-80 dark:bg-opacity-90 z-50 hidden flex justify-center items-center"
    >
      <div class="relative max-w-[90%] max-h-[90%]">
        <button
          id="closeModal"
          title="Close modal"
          class="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-gray-300"
        >
          &times;
        </button>
        <img
          id="modalImage"
          class="max-w-full max-h-[90vh] object-contain rounded"
          src=""
          alt=""
        />
        <div
          id="modalTitle"
          class="absolute -bottom-10 left-0 text-white text-base p-2 bg-black bg-opacity-50 rounded"
        >
        </div>
        <a
          id="downloadImage"
          title="Download image"
          class="absolute -top-10 left-0 text-white hover:text-gray-300 transition-colors cursor-pointer p-2 rounded-md hover:bg-black hover:bg-opacity-30"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 inline-block mr-1"
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
          </svg>{" "}
          Download
        </a>
      </div>
    </div>
  );
}
