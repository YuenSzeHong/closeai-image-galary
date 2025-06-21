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
  async GET(req, ctx: FreshContext) {
    const taskId = ctx.params.taskId;
    console.log(`[${taskId}] 📥 Starting streaming download`);

    try {
      const kv = await getKv();
      
      // 检查任务元数据
      const metaResult = await kv.get<ExportStreamTaskMetadata>([
        "export_stream_meta",
        taskId,
      ]);

      if (!metaResult.value || metaResult.value.status !== "ready_for_download") {
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

      // 初始化任务状态
      const initialStatus: TaskStatus = {
        status: 'streaming',
        totalImages: allImages.length,
        processedImages: 0,
        lastUpdate: Date.now()
      };
      await kv.set(['streaming_task', taskId], initialStatus);

      // 创建流式响应
      const headers = new Headers();
      headers.set('Content-Type', 'application/zip');
      headers.set('Content-Disposition', `attachment; filename="${taskMeta.filename}"`);
      headers.set('Cache-Control', 'no-cache');
      headers.set('Transfer-Encoding', 'chunked');

      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              await streamZipWithFflate(
                controller, 
                taskId, 
                taskMeta, 
                allImages, 
                kv
              );
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
      return new Response(`Error: ${error.message}`, { status: 500 });
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

  await updateStatus({ status: 'streaming' });

  // 使用 fflate 创建流式 ZIP
  const zip = new fflate.Zip();

  // 设置 ZIP 数据处理器 - 立即发送每个块
  zip.ondata = (err, chunk, final) => {
    if (err) {
      console.error(`[${taskId}] ZIP error:`, err);
      controller.error(new Error(`ZIP error: ${err.message}`));
      return;
    }
    
    if (chunk && chunk.length > 0) {
      controller.enqueue(chunk);
    }
    
    if (final) {
      console.log(`[${taskId}] ✅ ZIP stream completed`);
      controller.close();
    }
  };

  try {
    // 添加元数据文件
    if (taskMeta.includeMetadata) {
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
    }

    // 批量处理图片
    const BATCH_SIZE = 20; // 状态更新间隔
    const DOWNLOAD_BATCH_SIZE = 10; // 并发下载数量
    
    for (let i = 0; i < allImages.length; i += DOWNLOAD_BATCH_SIZE) {
      const batchEnd = Math.min(i + DOWNLOAD_BATCH_SIZE, allImages.length);
      const currentBatch = allImages.slice(i, batchEnd);
      
      console.log(`[${taskId}] 📦 Processing batch ${Math.floor(i/DOWNLOAD_BATCH_SIZE) + 1}/${Math.ceil(allImages.length/DOWNLOAD_BATCH_SIZE)}`);
      
      // 并发下载当前批次
      const downloadPromises = currentBatch.map(async (image) => {
        try {
          const response = await fetch(image.url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(45000),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const imageData = new Uint8Array(await response.arrayBuffer());
          const extension = getExtensionFromResponse(response, image.url);

          return { success: true, image, imageData, extension };
        } catch (error) {
          console.error(`[${taskId}] Failed to download ${image.title}:`, error);
          throw new Error(`Failed to download "${image.title}": ${error.message}`);
        }
      });

      // 等待批次完成
      const results = await Promise.all(downloadPromises);
      
      // 立即将下载的图片添加到ZIP流
      for (const result of results) {
        if (result.success) {
          const datePrefix = formatDateForFilename(result.image.created_at);
          const titlePart = sanitizeFilename(result.image.title, 50);
          const filename = `images/${datePrefix}_${titlePart}_${result.image.id.slice(-8)}.${result.extension}`;

          const imageFile = new fflate.ZipDeflate(filename, { level: 4 });
          zip.add(imageFile);
          imageFile.push(result.imageData, true);
          
          processedImages++;
          console.log(`[${taskId}] ✅ Added to ZIP: ${filename}`);
        }
      }

      // 更新状态
      if (processedImages % BATCH_SIZE === 0 || i + DOWNLOAD_BATCH_SIZE >= allImages.length) {
        await updateStatus({ processedImages });
        console.log(`[${taskId}] 📊 Progress: ${processedImages}/${allImages.length} images`);
      }

      // 批次间稍微暂停，避免过载
      if (i + DOWNLOAD_BATCH_SIZE < allImages.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // 强制垃圾回收，释放已处理的图片内存
      if (globalThis.gc && (i + DOWNLOAD_BATCH_SIZE) % 50 === 0) {
        globalThis.gc();
      }
    }

    // 处理缩略图
    if (taskMeta.includeThumbnails) {
      console.log(`[${taskId}] 🖼️ Processing thumbnails...`);
      
      const THUMBNAIL_BATCH_SIZE = 10;
      const maxThumbnails = Math.min(allImages.length, 500);
      
      for (let i = 0; i < maxThumbnails; i += THUMBNAIL_BATCH_SIZE) {
        const batchEnd = Math.min(i + THUMBNAIL_BATCH_SIZE, maxThumbnails);
        const currentBatch = allImages.slice(i, batchEnd);
        
        // 并发下载缩略图（失败不中断）
        const thumbnailPromises = currentBatch.map(async (image) => {
          try {
            // deno-lint-ignore no-explicit-any
            const thumbnailUrl = (image.metadata?.encodings as any)?.thumbnail?.path;
            if (typeof thumbnailUrl === "string" && thumbnailUrl.startsWith("http")) {
              const response = await fetch(thumbnailUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                signal: AbortSignal.timeout(20000),
              });

              if (response.ok) {
                const thumbnailData = new Uint8Array(await response.arrayBuffer());
                const extension = getExtensionFromResponse(response, thumbnailUrl) || "jpg";
                return { success: true, image, thumbnailData, extension };
              }
            }
            return { success: false };
          } catch (error) {
            return { success: false };
          }
        });

        const thumbnailResults = await Promise.all(thumbnailPromises);
        
        // 将成功的缩略图添加到ZIP
        for (const result of thumbnailResults) {
          if (result.success) {
            const datePrefix = formatDateForFilename(result.image.created_at);
            const titlePart = sanitizeFilename(result.image.title, 50);
            const filename = `thumbnails/${datePrefix}_${titlePart}_${result.image.id.slice(-8)}_thumb.${result.extension}`;

            const thumbnailFile = new fflate.ZipDeflate(filename, { level: 6 });
            zip.add(thumbnailFile);
            thumbnailFile.push(result.thumbnailData, true);
          }
        }

        // 批次间暂停
        if (i + THUMBNAIL_BATCH_SIZE < maxThumbnails) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      console.log(`[${taskId}] 📦 Thumbnails processing completed`);
    }

    // 完成ZIP流
    await updateStatus({ 
      status: 'completed', 
      processedImages: allImages.length 
    });
    
    console.log(`[${taskId}] 🎊 Finalizing ZIP...`);
    zip.end();
    
  } catch (error) {
    console.error(`[${taskId}] Processing error:`, error);
    await updateStatus({ 
      status: 'failed', 
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}