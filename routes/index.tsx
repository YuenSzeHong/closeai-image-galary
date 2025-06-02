import { Head } from "$fresh/runtime.ts";
import Header from "../components/Header.tsx";
import SettingsPanel from "../components/SettingsPanel.tsx";
import ImageModal from "../components/ImageModal.tsx";
import ImageGallery from "../islands/ImageGallery.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>CloseAI Image Gallery</title>
        <meta name="description" content="View all your generated images from ChatGPT" />
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          {`
            tailwind.config = {
              darkMode: 'class',
              theme: {
                extend: {
                  colors: {
                    primary: '#10a37f',
                    primaryDark: '#0c8c6a',
                    error: '#ef4444',
                    gray: { 850: '#18212f', 900: '#111827' }
                  }
                }
              }
            }
          `}
        </script>
        <style>
          {`
            .gallery-image-container {
              width: 100%; aspect-ratio: 3 / 4; display: flex;
              align-items: center; justify-content: center;
              overflow: hidden; border-radius: 0.25rem;
            }
            .gallery-image-container.placeholder {
              background-color: #e5e7eb;
              animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
            .dark .gallery-image-container.placeholder { background-color: #374151; }
            .gallery-image-container img { width: 100%; height: 100%; object-fit: cover; }
          `}
        </style>
      </Head>
      
      <div class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-300 min-h-screen">
        <div class="max-w-6xl mx-auto px-4 py-6">
          <Header />
          <SettingsPanel />
          
          <div id="galleryContainer">
            <ImageGallery />
          </div>
        </div>
        
        <ImageModal />
        
        <div id="notification" class="fixed top-5 right-5 bg-primary text-white p-4 rounded shadow-lg transform translate-x-full transition-transform duration-300 z-50">
          Settings saved successfully!
        </div>
      </div>
    </>
  );
}

