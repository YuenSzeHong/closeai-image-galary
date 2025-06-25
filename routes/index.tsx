import { Head } from "$fresh/runtime.ts";
import Header from "../components/Header.tsx";
import ImageGallery from "../islands/ImageGallery.tsx";
import ProgressBar from "../islands/ProgressBar.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>CloseAI 图库</title>
        <meta name="description" content="查看您在 ChatGPT 中生成的所有图像" />
      </Head>

      <ProgressBar />

      <div class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-300 min-h-screen">
        <div class="max-w-6xl mx-auto px-4 py-6">
          <Header />

          <div id="galleryContainer">
            <ImageGallery />
          </div>
        </div>
      </div>
    </>
  );
}
