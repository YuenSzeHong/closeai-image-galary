import { Head } from "$fresh/runtime.ts";
import Header from "../components/Header.tsx";
import SettingsPanel from "../components/SettingsPanel.tsx";
import ImageModal from "../components/ImageModal.tsx";
import ImageGallery from "../islands/ImageGallery.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>CloseAI 图库</title>
        <meta name="description" content="查看您在 ChatGPT 中生成的所有图像" />
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
        <div
          id="notification"
          class="fixed top-5 right-5 bg-primary text-white p-4 rounded shadow-lg transform translate-x-full transition-transform duration-300 z-50"
        >
          设置保存成功！
        </div>
      </div>
    </>
  );
}
