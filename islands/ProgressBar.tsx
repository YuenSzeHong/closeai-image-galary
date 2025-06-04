import { useEffect, useState } from "preact/hooks";

interface ProgressState {
  isLoading: boolean;
  totalBatches: number;
  totalImages: number;
  failedBatches: number;
  currentStatus: string;
}

export default function ProgressBar() {
  const [progress, setProgress] = useState<ProgressState>({
    isLoading: false,
    totalBatches: 0,
    totalImages: 0,
    failedBatches: 0,
    currentStatus: "就绪"
  });
  
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const handleProgressUpdate = (event: CustomEvent<ProgressState>) => {
      setProgress(event.detail);
      setIsVisible(true);
    };

    const handleLoadingStart = () => {
      setProgress(prev => ({
        ...prev,
        isLoading: true,
        currentStatus: "开始加载图像..."
      }));
      setIsVisible(true);
      setIsFadingOut(false);
    };

    const handleLoadingComplete = () => {
      setProgress(prev => ({
        ...prev,
        isLoading: false,
        currentStatus: `完成 - 已加载 ${prev.totalImages} 张图像`
      }));
      
      // Start fade out after 3 seconds
      setTimeout(() => {
        setIsFadingOut(true);
        // Hide completely after fade animation
        setTimeout(() => {
          setIsVisible(false);
        }, 500);
      }, 3000);
    };

    globalThis.addEventListener("progressUpdate", handleProgressUpdate as EventListener);
    globalThis.addEventListener("loadingStart", handleLoadingStart);
    globalThis.addEventListener("loadingComplete", handleLoadingComplete);

    return () => {
      globalThis.removeEventListener("progressUpdate", handleProgressUpdate as EventListener);
      globalThis.removeEventListener("loadingStart", handleLoadingStart);
      globalThis.removeEventListener("loadingComplete", handleLoadingComplete);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div class={`fixed bottom-6 right-6 z-50 transition-all duration-500 ease-in-out ${
      isFadingOut 
        ? 'opacity-0 translate-y-4 scale-95' 
        : 'opacity-100 translate-y-0 scale-100'
    }`}>
      <div class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg rounded-xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-4 min-w-[280px] max-w-[320px]">
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2">
            {progress.isLoading ? (
              <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
            ) : (
              <div class="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
            )}
            <div class="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
              {progress.currentStatus}
            </div>
          </div>
        </div>
        
        <div class="space-y-2">
          <div class="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>批次: <span class="font-medium text-gray-800 dark:text-gray-200">{progress.totalBatches}</span></span>
            <span>图像: <span class="font-medium text-gray-800 dark:text-gray-200">{progress.totalImages}</span></span>
          </div>
          
          {progress.failedBatches > 0 && (
            <div class="text-xs">
              <span class="text-orange-600 dark:text-orange-400 font-medium">
                失败: {progress.failedBatches}
              </span>
            </div>
          )}
          
          {progress.isLoading && (
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div class="progress-shimmer bg-gradient-to-r from-blue-500 to-blue-600 h-1.5 rounded-full w-full"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
