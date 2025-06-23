// routes/api/export/[taskId].ts
import { FreshContext, Handlers } from "$fresh/server.ts";
import * as fflate from "fflate";
import { type ImageItem, type ExportStreamTaskMetadata } from "../../../lib/types.ts";
import { getKv } from "../../../utils/kv.ts";
import {
  formatDateForFilename,
  getExtensionFromResponse,
  sanitizeFilename,
} from "../../../utils/fileUtils.ts";

/** 简化的任务状态 - 用于内部状态跟踪 */
interface TaskStatus {
  status: 'streaming' | 'completed' | 'failed';
  processedImages: number;
  totalImages: number;
  error?: string;
  lastUpdate: number;
}

export const handler: Handlers = {
  async GET(_req, ctx: FreshContext) {
    const taskId = ctx.params.taskId;
    console.log(`[${taskId}] 📥 Starting streaming download`);

    try {
      const kv = await getKv();
      
      // 检查是否已经有一个进程在处理此任务
      const lockStatus = await kv.get(['streaming_task_lock', taskId]);
      if (lockStatus.value) {
        const lockAge = Date.now() - (lockStatus.value as { startTime: number }).startTime;
        if (lockAge < 60000) { // 1分钟内的锁视为有效
          console.warn(`[${taskId}] 任务已在处理中 (${Math.round(lockAge/1000)}s ago)，重定向...`);
          // 返回 307 临时重定向，让客户端在短暂延迟后重试
          return new Response(null, { 
            status: 307, 
            headers: { 
              'Location': `/api/export/${taskId}?t=${Date.now()}`,
              'Retry-After': '2' 
            } 
          });
        } else {
          console.warn(`[${taskId}] 检测到陈旧锁 (${Math.round(lockAge/1000)}s old)，继续处理`);
          // 清除陈旧锁
          await kv.delete(['streaming_task_lock', taskId]);
        }
      }
      
      // 检查任务元数据
      const metaResult = await kv.get<ExportStreamTaskMetadata>([
        "export_stream_meta",
        taskId,
      ]);      if (!metaResult.value || metaResult.value.status !== "ready_for_download") {
        return new Response('Task not ready', { status: 404 });
      }
      
      const taskMeta = metaResult.value;
      
      // 收集所有图片元数据
      const allImages: ImageItem[] = [];
      for (let i = 0; i < taskMeta.totalImageChunks; i++) {
        const chunkKey: Deno.KvKey = ["export_stream_images", taskId, `chunk_${i}`];
        const chunkResult = await kv.get<ImageItem[]>(chunkKey);
        if (chunkResult.value) {
          allImages.push(...chunkResult.value);
        }
      }

      console.log(`[${taskId}] 📊 Found ${allImages.length} images to process`);
      
      // 检查是否是范围请求
      const rangeHeader = _req.headers.get('Range');
      const isRangeRequest = !!rangeHeader;
      
      // 对于范围请求，需要适当响应以兼容下载管理器
      if (isRangeRequest) {
        console.log(`[${taskId}] 检测到范围请求: ${rangeHeader}`);
        
        // 将图片数量作为近似的内容大小计算依据
        // 粗略估计每张图片平均 500KB，用于下载管理器初始化
        const estimatedSize = allImages.length * 500 * 1024; 
        const estimatedSizeStr = String(estimatedSize);
        
        // 解析请求的范围
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (rangeMatch) {
          const startByte = parseInt(rangeMatch[1], 10);
          const endByte = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : estimatedSize - 1;
          
          if (startByte === 0) {
            // 这是下载管理器的初始请求，我们返回完整流
            console.log(`[${taskId}] 下载管理器初始请求，将提供完整流`);
            
            const headers = new Headers();
            headers.set('Content-Type', 'application/zip');
            headers.set('Content-Disposition', `attachment; filename="${taskMeta.filename}"`);
            headers.set('Accept-Ranges', 'none'); // 明确告知不支持范围请求
            headers.set('Content-Length', estimatedSizeStr); // 提供估计的大小
            
            // 不返回 206，而是返回 200 和完整内容
            return new Response(
              new ReadableStream({
                async start(controller) {
                  try {
                    await streamZipWithFflate(controller, taskId, taskMeta, allImages, kv);
                  } catch (error) {
                    console.error(`[${taskId}] Streaming error:`, error);
                    controller.error(error);
                  }
                }
              }),
              { 
                status: 200,
                headers,
                statusText: 'OK - Full content'
              }
            );
          } else {
            // 这是下载管理器的后续范围请求，我们目前不支持真正的范围
            console.log(`[${taskId}] 下载管理器范围请求（${startByte}-${endByte}），不支持部分内容`);
            
            const headers = new Headers();
            headers.set('Content-Type', 'application/zip');
            headers.set('Content-Disposition', `attachment; filename="${taskMeta.filename}"`);
            headers.set('Accept-Ranges', 'none');
            
            // 返回 416 Range Not Satisfiable
            return new Response(
              'Range requests are not supported for this resource. Please download the full file.',
              { 
                status: 416,
                headers,
                statusText: 'Range Not Satisfiable'              }
            );          }
        }
      }

      // 初始化任务状态
      const initialStatus: TaskStatus = {
        status: 'streaming',
        totalImages: allImages.length,
        processedImages: 0,
        lastUpdate: Date.now()
      };await kv.set(['streaming_task', taskId], initialStatus);
      
      // 创建流式响应，优化所有客户端（包括下载管理器）的兼容性
      const headers = new Headers();
      headers.set('Content-Type', 'application/zip');
      headers.set('Content-Disposition', `attachment; filename="${taskMeta.filename}"`);
      headers.set('Cache-Control', 'no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      // 明确告知客户端不支持范围请求，这样下载管理器会选择完整下载
      headers.set('Accept-Ranges', 'none');
      
      // 下载管理器通常需要知道内容长度，但我们无法准确预知
      // 一些下载管理器在没有Content-Length的情况下可能无法正常工作
      // 这里我们不设置Transfer-Encoding: chunked，而是让底层决定
      
      return new Response(
        new ReadableStream({          async start(controller) {
            try {
              // 监听请求中断信号
              const abortSignal = _req.signal;
              let abortListener: EventListener | null = null;
              let _isDisconnected = false; // 使用下划线前缀表示故意不使用
              
              if (abortSignal) {
                abortListener = () => {
                  console.log(`[${taskId}] 检测到客户端中断连接`);
                  _isDisconnected = true;
                  
                  // 下载管理器可能会断开连接并重新连接
                  // 我们不立即终止流，而是标记已断开并继续处理一段时间
                  // 如果是真正的取消下载，客户端不会重新连接
                  
                  // 设置一个延迟，如果在一定时间内没有新连接，才实际清理资源
                  setTimeout(() => {
                    // 在实际实现中，这里应该检查是否有新的连接到达
                    // 如果没有，可以考虑清理资源
                    console.log(`[${taskId}] 客户端断开连接已超过5秒，可能是真正取消下载`);
                  }, 5000);
                };
                
                abortSignal.addEventListener('abort', abortListener);
              }
                await streamZipWithFflate(
                controller, 
                taskId, 
                taskMeta, 
                allImages, 
                kv
              );
              
              // 清理中断信号监听器
              if (abortSignal && abortListener) {
                abortSignal.removeEventListener('abort', abortListener);
              }
            } catch (error) {
              console.error(`[${taskId}] Streaming error:`, error);
              controller.error(error);
            }
          }
        }),
        { headers }
      );

    } catch (error) {
      console.error(`[${taskId}] Error:`, error);
      return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
    }
  },
};

async function streamZipWithFflate(
  controller: ReadableStreamDefaultController,
  taskId: string,
  taskMeta: ExportStreamTaskMetadata,
  allImages: ImageItem[],
  kv: Deno.Kv
) {
  let processedImages = 0;
  let isControllerClosed = false;
  
  // 防止重复初始化 - 确保我们只运行一次流式处理
  const PROCESS_LOCK_KEY = ['streaming_task_lock', taskId];
  try {
    // 尝试获取锁，如果已经有一个进程在处理这个任务，则退出
    const lockResult = await kv.atomic()
      .check({ key: PROCESS_LOCK_KEY, versionstamp: null })
      .set(PROCESS_LOCK_KEY, { startTime: Date.now() })
      .commit();
    
    if (!lockResult.ok) {
      console.warn(`[${taskId}] 检测到重复处理请求，任务已在处理中`);
      controller.close();
      return;
    }
  } catch (lockError) {
    console.warn(`[${taskId}] 获取锁时出错:`, lockError);
    // 继续处理，因为这可能是第一次尝试
  }
  
  // 创建一个总体超时保护
  const MAX_EXECUTION_TIME = 15 * 60 * 1000; // 15分钟超时
  const startTime = Date.now();
  
  // 总并发限制（所有网络请求共享）
  const MAX_CONCURRENT_REQUESTS = 3;
  let activeRequests = 0;
  
  // 请求信号量，用于限制并发
  const requestSemaphore = {
    async acquire() {
      while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      activeRequests++;
    },
    release() {
      activeRequests--;
    }
  };
  
  // 检查整体超时的函数
  const checkOverallTimeout = () => {
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > MAX_EXECUTION_TIME) {
      throw new Error(`Export operation timed out after ${MAX_EXECUTION_TIME / 60000} minutes`);
    }
  };
    // 带有信号量的安全获取函数
  async function safeFetchWithSemaphore(
    url: string, 
    title: string,
    timeoutMs = 30000,
    retries = 2
  ): Promise<Response | null> {
    let lastError: Error | null = null;
    
    try {
      // 获取请求信号量
      await requestSemaphore.acquire();
      
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // 只在重试时添加日志
          if (attempt > 0) {
            console.log(`[${taskId}] Retry ${attempt}/${retries} for ${title}`);
          }
          
          // 创建 AbortController 用于超时控制
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
          
          try {
            // 使用更健壮的请求配置
            const response = await fetch(url, {
              // 不设置特定User-Agent以避免被一些服务器阻止
              headers: { 
                "Accept": "image/*, */*",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive"
              },
              // 启用自动重定向
              redirect: "follow",
              // 设置 5 秒的连接超时
              signal: abortController.signal,
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
          } catch (error) {
            clearTimeout(timeoutId);
            
            // TypeScript type guard
            if (error instanceof Error && error.name === 'AbortError') {
              throw new Error(`Timeout (${timeoutMs}ms)`);
            }
            throw error;
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // 最后一次尝试失败时记录错误
          if (attempt === retries) {
            console.error(`[${taskId}] Failed to fetch ${title} after ${retries + 1} attempts: ${lastError.message}`);
          }
          
          // 在重试前等待一段时间
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }
      
      return null;
    } finally {
      // 释放请求信号量
      requestSemaphore.release();
    }
  }

  const updateStatus = async (updates: Partial<TaskStatus>) => {
    try {
      const current = await kv.get<TaskStatus>(['streaming_task', taskId]);
      if (current.value) {
        const updated = { ...current.value, ...updates, lastUpdate: Date.now() };
        await kv.set(['streaming_task', taskId], updated);
      }
    } catch (error) {
      console.warn(`[${taskId}] Failed to update status:`, error);
    }
  };

  await updateStatus({ status: 'streaming' });  // 使用 fflate 创建流式 ZIP
  const zip = new fflate.Zip();
  
  // 使用互斥锁来保护控制器操作
  let enqueueMutex = false;
  // 缓存小块数据以减少传输次数，提高下载管理器兼容性
  const chunkBuffer: Uint8Array[] = [];
  let bufferSize = 0;
  const MAX_BUFFER_SIZE = 64 * 1024; // 64KB 缓冲区大小
  
  // 将缓冲区中的数据刷新到流中
  const flushBuffer = () => {
    if (chunkBuffer.length === 0 || isControllerClosed) return;
    
    // 计算总长度
    const totalLength = bufferSize;
    
    // 创建一个单一的大数组
    const combinedChunk = new Uint8Array(totalLength);
    let offset = 0;
    
    // 复制所有片段到合并数组
    for (const chunk of chunkBuffer) {
      combinedChunk.set(chunk, offset);
      offset += chunk.length;
    }
    
    // 清空缓冲区
    chunkBuffer.length = 0;
    bufferSize = 0;
    
    // 将合并的数据发送到流
    try {
      controller.enqueue(combinedChunk);
    } catch (e) {
      console.error(`[${taskId}] 刷新缓冲区时出错:`, e);
      isControllerClosed = true;
    }
  };
  
  // 设置 ZIP 数据处理器 - 批量发送数据块以提高效率
  zip.ondata = (err, chunk, final) => {
    if (isControllerClosed) {
      return; // 如果控制器已关闭，什么都不做
    }
    
    if (err) {
      console.error(`[${taskId}] ZIP error:`, err);
      try {
        isControllerClosed = true;
        controller.error(new Error(`ZIP error: ${err.message}`));
      } catch (e) {
        console.error(`[${taskId}] Failed to signal controller error:`, e);
      }
      return;
    }
    
    // 使用互斥锁保护控制器操作
    if (enqueueMutex) {
      console.warn(`[${taskId}] 数据块处理被跳过，因为另一个操作正在进行`);
      return;
    }
    
    enqueueMutex = true;
    
    try {
      // 只有在有数据且控制器未关闭时才处理
      if (chunk && chunk.length > 0 && !isControllerClosed) {
        // 将块添加到缓冲区
        chunkBuffer.push(chunk);
        bufferSize += chunk.length;
        
        // 如果缓冲区足够大或这是最终块，刷新缓冲区
        if (bufferSize >= MAX_BUFFER_SIZE || final) {
          flushBuffer();
        }
      }
      
      // 只有在是最终块且控制器未关闭时才关闭控制器
      if (final && !isControllerClosed) {
        // 确保所有数据都已刷新
        flushBuffer();
        
        try {
          console.log(`[${taskId}] ✅ ZIP stream completed`);
          isControllerClosed = true;
          controller.close();
        } catch (e) {
          console.error(`[${taskId}] Failed to close controller:`, e);
          isControllerClosed = true;
        }
      }
    } finally {
      enqueueMutex = false;
    }
  };

  try {    // 添加元数据文件
    if (taskMeta.includeMetadata) {
      // 先检查控制器状态
      if (isControllerClosed) {
        console.warn(`[${taskId}] 控制器已关闭，跳过添加元数据`);
        return;
      }
      
      try {
        const metadataObj = allImages.map((img) => ({
          id: img.id,
          title: img.title,
          created_at: img.created_at,
          width: img.width,
          height: img.height,
          original_url: img.url,
        }));
        const metadataBytes = new TextEncoder().encode(JSON.stringify(metadataObj, null, 2));
        
        const metaFile = new fflate.ZipDeflate("metadata.json", { level: 1 });
        zip.add(metaFile);
        metaFile.push(metadataBytes, true);
        console.log(`[${taskId}] 📄 Metadata added to ZIP`);
      } catch (metaError) {
        console.error(`[${taskId}] 添加元数据时出错:`, metaError);
        // 如果添加元数据失败，继续处理图片
      }
    }

    // 创建全局重复检测集
    const processedItems = new Map<string, { images: Set<string>, thumbnails: Set<string> }>();
    processedItems.set(taskId, { 
      images: new Set<string>(), 
      thumbnails: new Set<string>() 
    });    // 批量处理图片和对应的缩略图
    const BATCH_SIZE = 10; // 状态更新间隔
    const DOWNLOAD_BATCH_SIZE = 5; // 并发下载数量，减少并发以降低内存压力
    
    for (let i = 0; i < allImages.length; i += DOWNLOAD_BATCH_SIZE) {
      // 首先检查控制器状态
      if (isControllerClosed) {
        console.warn(`[${taskId}] 控制器已关闭，中止图片处理`);
        break;
      }

      const batchEnd = Math.min(i + DOWNLOAD_BATCH_SIZE, allImages.length);
      const currentBatch = allImages.slice(i, batchEnd);
      
      // 检查总体超时
      checkOverallTimeout();
      
      console.log(`[${taskId}] 📦 Processing batch ${Math.floor(i/DOWNLOAD_BATCH_SIZE) + 1}/${Math.ceil(allImages.length/DOWNLOAD_BATCH_SIZE)}`);
      
      // 为每个图片单独处理，减少内存压力
      // 获取当前任务的跟踪集
      const trackingSets = processedItems.get(taskId);
      if (!trackingSets) {
        console.error(`[${taskId}] 无法找到跟踪集，创建新的`);
        processedItems.set(taskId, { images: new Set<string>(), thumbnails: new Set<string>() });
      }
      
      const processedImageIds = trackingSets?.images || new Set<string>();
      const processedThumbnailUrls = trackingSets?.thumbnails || new Set<string>();
      
      for (const image of currentBatch) {
        // 检查控制器状态
        if (isControllerClosed) {
          console.warn(`[${taskId}] 控制器已关闭，跳过剩余图片`);
          break;
        }
        
        // 跳过已处理的图片
        if (processedImageIds.has(image.id)) {
          console.log(`[${taskId}] 🔄 Skipping duplicate image: ${image.title} (${image.id.slice(-8)})`);
          continue;
        }
        
        try {
          // 并行处理原始图片和缩略图
          const imageFetchPromise = safeFetchWithSemaphore(
            image.url, 
            image.title, 
            30000,  // 30秒超时，足够大部分图片下载
            3       // 增加到3次重试，提高可靠性
          );
          
          // 同时开始获取缩略图（如果需要）
          let thumbnailFetchPromise = null;
          let thumbnailUrl = null;
          
          if (taskMeta.includeThumbnails) {
            // deno-lint-ignore no-explicit-any
            thumbnailUrl = (image.metadata?.encodings as any)?.thumbnail?.path;
            
            // 尝试从其他位置找缩略图URL
            if (typeof thumbnailUrl !== "string" || !thumbnailUrl.startsWith("http")) {
              // deno-lint-ignore no-explicit-any
              thumbnailUrl = (image as any)?.encodings?.thumbnail?.path ||
                // deno-lint-ignore no-explicit-any
                (image as any)?.encodings?.thumbnail?.originalPath;
            }
            
            // 如果找到有效的缩略图URL且尚未处理，则获取它
            if (typeof thumbnailUrl === "string" && thumbnailUrl.startsWith("http") && 
                !processedThumbnailUrls.has(thumbnailUrl)) {
              thumbnailFetchPromise = safeFetchWithSemaphore(
                thumbnailUrl,
                `${image.title} thumbnail`,
                20000, // 20秒超时，缩略图通常较小
                2      // 2次重试
              );
              
              if (i === 0) {
                console.log(`[${taskId}] 同时处理缩略图: ${thumbnailUrl}`);
              }
            }
          }
          
          // 处理原始图片
          const response = await imageFetchPromise;
          if (!response) {
            console.error(`[${taskId}] Failed to fetch ${image.title} after retries`);
            continue;
          }

          let imageData = new Uint8Array(await response.arrayBuffer());
          const extension = getExtensionFromResponse(response, image.url);
          
          const datePrefix = formatDateForFilename(image.created_at);
          const titlePart = sanitizeFilename(image.title, 50);
          const filename = `images/${datePrefix}_${titlePart}_${image.id.slice(-8)}.${extension}`;

          // 将图片添加到ZIP
          try {
            // 再次检查重复
            if (processedImageIds.has(image.id)) {
              console.log(`[${taskId}] 🔄 Image was processed by another thread: ${image.title}`);
              // 释放内存
              // @ts-ignore: 强制标记为空以便垃圾回收
              imageData = null;
              continue;
            }
            
            const imageFile = new fflate.ZipDeflate(filename, { level: 3 }); // 降低压缩级别以减少内存使用
            zip.add(imageFile);
            imageFile.push(imageData, true);
            
            // 标记为已处理
            processedImageIds.add(image.id);
            
            processedImages++;
            console.log(`[${taskId}] ✅ Added to ZIP: ${filename}`);
          } catch (zipError) {
            console.error(`[${taskId}] ZIP error while adding ${filename}:`, zipError);
            // 继续处理其他图片，不中断整个过程
          }
          
          // 立即释放内存
          // @ts-ignore: 强制标记为空以便垃圾回收
          imageData = null;
          
          // 处理缩略图（如果有）
          if (thumbnailFetchPromise) {
            try {
              const thumbnailResponse = await thumbnailFetchPromise;
              
              if (thumbnailResponse) {
                let thumbnailData = new Uint8Array(await thumbnailResponse.arrayBuffer());
                const thumbExtension = getExtensionFromResponse(thumbnailResponse, thumbnailUrl || "") || "jpg";
                
                const thumbnailFilename = `thumbnails/${datePrefix}_${titlePart}_${image.id.slice(-8)}_thumb.${thumbExtension}`;

                // 再次检查重复
                if (!processedThumbnailUrls.has(thumbnailUrl!)) {
                  const thumbnailFile = new fflate.ZipDeflate(thumbnailFilename, { level: 3 });
                  zip.add(thumbnailFile);
                  thumbnailFile.push(thumbnailData, true);
                  
                  // 标记为已处理
                  processedThumbnailUrls.add(thumbnailUrl!);
                  
                  console.log(`[${taskId}] ✅ Added thumbnail to ZIP: ${thumbnailFilename}`);
                }
                
                // 立即释放内存
                // @ts-ignore: 强制标记为空以便垃圾回收
                thumbnailData = null;
              }
            } catch (thumbnailError) {
              console.error(`[${taskId}] Failed to process thumbnail: ${thumbnailError}`);
              // 继续处理，不因缩略图错误中断
            }
          }
          
        } catch (error) {
          console.error(`[${taskId}] Failed to process ${image.title}:`, error);
          // 继续处理其他图片
        }
      }

      // 更新状态
      if (processedImages % BATCH_SIZE === 0 || i + DOWNLOAD_BATCH_SIZE >= allImages.length) {
        await updateStatus({ processedImages });
        console.log(`[${taskId}] 📊 Progress: ${processedImages}/${allImages.length} images`);
      }

      // 批次间稍微暂停，让垃圾回收有机会运行
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 尝试主动触发垃圾回收
      try {
        // @ts-ignore: gc 可能在某些环境中存在
        if (globalThis.gc) {
          // @ts-ignore: 调用 gc 函数
          globalThis.gc();
        }
      } catch (_e) {
        // 忽略不支持 gc() 的环境
      }
    }    // 完成ZIP流
    await updateStatus({ 
      status: 'completed', 
      processedImages: allImages.length 
    });
    
    console.log(`[${taskId}] 🎊 Finalizing ZIP...`);
    
    // 确保我们还没有关闭控制器
    if (!isControllerClosed) {
      try {
        zip.end();
      } catch (finalizeError) {
        console.error(`[${taskId}] Error finalizing ZIP:`, finalizeError);
        // 如果关闭ZIP失败但控制器仍然开放，尝试通过控制器发送错误
        if (!isControllerClosed) {
          try {
            isControllerClosed = true;
            controller.error(finalizeError);
          } catch (controllerError) {
            console.error(`[${taskId}] Failed to signal controller error:`, controllerError);
          }
        }
      }
    }
  } catch (error) {
    console.error(`[${taskId}] Processing error:`, error);
    try {
      await updateStatus({ 
        status: 'failed', 
        error: error instanceof Error ? error.message : String(error)
      });
    } catch (statusError) {
      console.error(`[${taskId}] Failed to update error status:`, statusError);
    }
    
    if (!isControllerClosed) {
      try {
        isControllerClosed = true;
        controller.error(error);
      } catch (controllerError) {
        console.error(`[${taskId}] Failed to signal controller error:`, controllerError);
      }
    }
  } finally {    // 清理任务锁，以便后续请求可以处理
    try {
      await kv.delete(['streaming_task_lock', taskId]);
      console.log(`[${taskId}] 已清理任务锁`);
    } catch (cleanupError) {
      console.error(`[${taskId}] 清理任务锁时出错:`, cleanupError);
    }
  }
}