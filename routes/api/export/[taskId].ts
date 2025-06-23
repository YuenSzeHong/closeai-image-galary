// routes/api/export/[taskId].ts - 方案B完整重写版本
import { FreshContext, Handlers } from "$fresh/server.ts";
import * as fflate from "fflate";
import { getKv } from "../../../utils/kv.ts";
import { getExtensionFromResponse, formatDateForFilename, sanitizeFilename } from "../../../utils/fileUtils.ts";

interface TaskMeta {
  taskId: string;
  teamId?: string;
  includeMetadata: boolean;
  includeThumbnails: boolean;
  filename: string;
  totalImages: number;
  totalChunks: number;
}

interface ImageData {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title: string;
  created_at: number;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
}

export const handler: Handlers = {  async GET(_req, ctx: FreshContext) {
    const taskId = ctx.params.taskId;
    console.log(`[${taskId}] 📥 开始下载`);

    try {
      const kv = await getKv();
      
      // 获取任务信息
      const taskResult = await kv.get<TaskMeta>(['tasks', taskId]);
      if (!taskResult.value) {
        return new Response('任务未找到', { status: 404 });
      }
      
      const task = taskResult.value;
      console.log(`[${taskId}] 📊 找到${task.totalImages}张图片，分布在${task.totalChunks}个数据块中`);
        // 创建流式响应
      const headers = new Headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${task.filename}"`,
        'Cache-Control': 'no-store, must-revalidate',
        'Accept-Ranges': 'none',
        'X-Content-Type-Options': 'nosniff',
        'Transfer-Encoding': 'chunked', // Explicitly use chunked encoding
      });
      
      // Estimate size to help browsers - this is just a rough estimate
      const estimatedSize = task.totalImages * 500 * 1024; // Assume ~500KB per image
      if (estimatedSize > 0) {
        headers.set('X-Content-Length-Hint', estimatedSize.toString());
      }
      
      return new Response(
        new ReadableStream({
          async start(controller) {            try {
              await processTask(controller, taskId, task, kv);
            } catch (error) {
              console.error(`[${taskId}] 错误:`, error);
              controller.error(error);
            }
          }
        }),
        { headers }
      );

    } catch (error) {
      console.error(`[${taskId}] 设置错误:`, error);
      return new Response(`错误: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
    }
  },
};

async function processTask(
  controller: ReadableStreamDefaultController,
  taskId: string,
  task: TaskMeta,
  kv: Deno.Kv
) {
  // 🔒 获取任务锁，防止并发处理
  const lockKey = ['task_lock', taskId];
  const lockResult = await kv.atomic()
    .check({ key: lockKey, versionstamp: null })
    .set(lockKey, { startTime: Date.now(), pid: crypto.randomUUID() }, { expireIn: 10 * 60 * 1000 })
    .commit();
  
  if (!lockResult.ok) {
    // 检查锁的年龄，如果太老可能是僵尸锁
    const existingLock = await kv.get(lockKey);
    if (existingLock.value) {      const lockAge = Date.now() - (existingLock.value as any).startTime;
      if (lockAge > 5 * 60 * 1000) { // 5分钟的僵尸锁
        console.warn(`[${taskId}] 移除过期锁 (${Math.round(lockAge/1000)}秒)`);
        await kv.delete(lockKey);
        // 重试获取锁
        const retryResult = await kv.atomic()
          .check({ key: lockKey, versionstamp: null })
          .set(lockKey, { startTime: Date.now(), pid: crypto.randomUUID() }, { expireIn: 10 * 60 * 1000 })
          .commit();
        if (!retryResult.ok) {
          throw new Error('任务正在被另一个请求处理中');
        }
      } else {
        throw new Error('任务正在被另一个请求处理中');
      }    }
  }
  
  console.log(`[${taskId}] 🔒 获取任务锁`);
    let closed = false;
  
  // Configure zip with lower compression level to reduce CPU usage
  const zip = new fflate.Zip({
    level: 1, // Use lowest compression level to reduce CPU/memory usage
    mem: 8    // Use less memory for compression (default is 8)
  });
  
  // Send ZIP data chunks immediately without buffering
  zip.ondata = (err, chunk, final) => {
    if (closed) return;
      if (err) {
      console.error(`[${taskId}] ZIP错误:`, err);
      if (!closed) {
        closed = true;
        controller.error(new Error(`ZIP错误: ${err.message}`));
      }
      return;
    }
    
    if (chunk && chunk.length > 0) {
      try {
        controller.enqueue(chunk);
      } catch (e) {
        console.error(`[${taskId}] 控制器错误:`, e);
        closed = true;
      }
    }
    
    if (final && !closed) {
      try {
        console.log(`[${taskId}] ✅ 完成`);
        controller.close();
      } catch (e) {
        console.error(`[${taskId}] 关闭错误:`, e);
      } finally {
        closed = true;
      }
    }
  };

  try {    // 🎯 方案B：先写元数据，立即清空KV
    if (task.includeMetadata) {
      console.log(`[${taskId}] 📄 添加metadata.json`);
      await writeMetadata(zip, taskId, task, kv);
      
      console.log(`[${taskId}] 🧹 从KV中清除元数据`);
      await clearMetadata(taskId, task, kv);
    }
      // 然后处理图片
    let successCount = 0;
    let errorCount = 0;
    console.log(`[${taskId}] 📸 处理图片中`);
    await processImages(zip, taskId, task, kv, (success) => {
      if (success) {
        successCount++;
        // Only log progress occasionally instead of for every item
        if (successCount % 20 === 0 || successCount + errorCount === task.totalImages) {
          console.log(`[${taskId}] 📊 进度: ${successCount + errorCount}/${task.totalImages} (${errorCount}个错误)`);
        }
      } else {
        errorCount++;
      }
    });
    
    // Log final summary
    console.log(`[${taskId}] 📊 最终结果: ${successCount + errorCount}/${task.totalImages} 完成 (${errorCount}个错误)`);
    
    // 完成ZIP    zip.end();
    
  } catch (error) {
    console.error(`[${taskId}] 处理错误:`, error);
    if (!closed) {
      closed = true;
      controller.error(error);
    }
  } finally {
    // 🔒 释放任务锁
    try {
      await kv.delete(['task_lock', taskId]);
      console.log(`[${taskId}] 🔓 释放任务锁`);
    } catch (lockError) {
      console.error(`[${taskId}] 释放锁错误:`, lockError);
    }
  }
}

async function writeMetadata(zip: fflate.Zip, taskId: string, task: TaskMeta, kv: Deno.Kv) {
  const file = new fflate.ZipDeflate("metadata.json", { level: 1 });
  zip.add(file);
  
  // 开始JSON数组
  file.push(new TextEncoder().encode("[\n"), false);
    let first = true;
  const encoder = new TextEncoder();
  
  for (let i = 0; i < task.totalChunks; i++) {
    const chunk = await kv.get<ImageData[]>(['meta_chunks', taskId, i]);
    if (!chunk.value) continue;
    
    // Process chunk items in smaller batches to avoid memory issues
    const metadataChunkSize = 10;
    for (let j = 0; j < chunk.value.length; j += metadataChunkSize) {
      const batchMetadata = chunk.value.slice(j, j + metadataChunkSize);
      
      for (const img of batchMetadata) {
        const separator = first ? "" : ",\n";
        const jsonObj = {
          id: img.id,
          title: img.title,
          created_at: img.created_at,
          width: img.width,
          height: img.height,
          url: img.url,
          ...(img.metadata || {})
        };
        const json = separator + JSON.stringify(jsonObj, null, 2);
        
        file.push(encoder.encode(json), false);
        first = false;
      }
      
      // Add small pause between metadata batches
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Clear chunk data after processing
    chunk.value = null;
    
    // Add a longer pause between chunks
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Force GC between chunks
    try {
      // @ts-ignore: Deno doesn't type gc() but it exists in some environments
      if (globalThis.gc) globalThis.gc();
    } catch (e) {
      // Ignore errors from GC
    }
  }
  
  // 结束JSON数组
  file.push(new TextEncoder().encode("\n]"), true);
}

async function clearMetadata(taskId: string, task: TaskMeta, kv: Deno.Kv) {
  // Clear metadata in small batches to avoid memory pressure
  const batchSize = 5;
  
  for (let i = 0; i < task.totalChunks; i += batchSize) {
    const ops = kv.atomic();
    const end = Math.min(i + batchSize, task.totalChunks);
    
    for (let j = i; j < end; j++) {
      ops.delete(['meta_chunks', taskId, j]);
    }
    
    await ops.commit();
    
    // Small pause between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Finally delete the meta info
  await kv.delete(['meta_info', taskId]);
}

async function processImages(
  zip: fflate.Zip, 
  taskId: string, 
  task: TaskMeta, 
  kv: Deno.Kv,
  progressCallback?: (success: boolean) => void
) {
  let processed = 0;
    for (let i = 0; i < task.totalChunks; i++) {
    console.log(`[${taskId}] 📦 数据块 ${i + 1}/${task.totalChunks}`);
      // Force GC before each chunk
    try {
      // @ts-ignore: Deno doesn't type gc() but it exists in some environments
      if (globalThis.gc) globalThis.gc();
    } catch (e) {
      // Ignore errors from GC
    }
    
    // Get chunk data
    const chunk = await kv.get<ImageData[]>(['img_chunks', taskId, i]);
    if (!chunk.value) continue;
    
    // Process in small batches to limit memory use
    const batchSize = 3; // Reduce to 3 images per batch (was 5)
    const imageArray = [...chunk.value]; // Create a copy
    
    // Clear the original data reference immediately
    chunk.value = null;
    
    for (let j = 0; j < imageArray.length; j += batchSize) {
      const batchImages = imageArray.slice(j, j + batchSize);
      
      // Process each batch image serially
      for (const img of batchImages) {        // Check if already processed        const done = await kv.get(['done', taskId, img.id]);
        if (done.value) {
          // Silently skip already processed items (no logging)
          processed++;
          if (progressCallback) {
            progressCallback(true);
          }
          continue;
        }
        
        try {
          // Process main image with retry logic
          await processImageWithRetry(img, zip, taskId, false);
          
          // Process thumbnail
          if (task.includeThumbnails && img.thumbnailUrl && img.thumbnailUrl !== img.url) {
            await processImageWithRetry(img, zip, taskId, true);
          }
            // Mark as complete
          await kv.set(['done', taskId, img.id], true, { expireIn: 2 * 60 * 60 * 1000 });
          
          processed++;
          // Notify progress through callback if provided
          if (progressCallback) {
            progressCallback(true);
          }
          
          // Force GC after each image to prevent memory buildup
          try {
            // @ts-ignore: Deno doesn't type gc() but it exists in some environments
            if (globalThis.gc) globalThis.gc();
          } catch (e) {
            // Ignore errors from GC
          }          } catch (error) {
          console.error(`[${taskId}] ❌ 失败 ${img.id}:`, error);
          await kv.set(['failed', taskId, img.id], { error: error.message, time: Date.now() });
          
          // Notify error through callback if provided
          if (progressCallback) {
            progressCallback(false);
          }
        }
      }
      
      // Clear the batch images after processing
      batchImages.length = 0;
      
      // Add a longer pause between batches (was 200ms)
      await new Promise(resolve => setTimeout(resolve, 500));
        // Force GC between batches
      try {
        // @ts-ignore: Deno doesn't type gc() but it exists in some environments
        if (globalThis.gc) globalThis.gc();
      } catch (e) {
        // Ignore errors from GC
      }
    }
    
    // Clear chunk data to free memory
    imageArray.length = 0;
    
    // Longer pause between chunks (was 500ms)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Process image with retry logic
async function processImageWithRetry(img: ImageData, zip: fflate.Zip, taskId: string, isThumbnail: boolean, retries = 2) {
  let attempt = 0;
  let lastError: Error | null = null;
  
  while (attempt <= retries) {
    try {
      if (attempt > 0) {
        console.log(`[${taskId}] 🔄 Retry ${attempt}/${retries} for ${img.id}`);
        // Add exponential backoff delay between retries
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
      
      await processImageStream(img, zip, taskId, isThumbnail);
      return; // Success, exit retry loop
      
    } catch (error) {
      lastError = error;
      console.error(`[${taskId}] ⚠️ Attempt ${attempt + 1} failed for ${img.id}:`, error);
      attempt++;
      
      // Force GC after each failed attempt
      try {
        // @ts-ignore: Deno doesn't type gc() but it exists in some environments
        if (globalThis.gc) globalThis.gc();
      } catch (e) {
        // Ignore errors from GC
      }
    }
  }
  
  // If we got here, all retries failed
  throw lastError || new Error("Failed to process image after retries");
}

// Process image using streaming to minimize memory usage
async function processImageStream(img: ImageData, zip: fflate.Zip, taskId: string, isThumbnail: boolean) {
  const url = isThumbnail ? img.thumbnailUrl! : img.url;
  const timeout = isThumbnail ? 15000 : 30000;
  
  // Setup abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'image/*' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    // Generate filename
    const date = formatDateForFilename(img.created_at);
    const title = sanitizeFilename(img.title, 50);
    const id = img.id.slice(-8);
    const ext = getExtensionFromResponse(response, url);
    
    const folder = isThumbnail ? 'thumbnails' : 'images';
    const suffix = isThumbnail ? '_thumb' : '';
    const filename = `${folder}/${date}_${title}_${id}${suffix}.${ext}`;
    
    // Process with streams if supported
    if (response.body) {
      const file = new fflate.ZipDeflate(filename, { level: 3 });
      zip.add(file);
      
      // Using streams to process data in chunks
      const reader = response.body.getReader();
      const chunkSize = 64 * 1024; // 64KB chunks
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (value && value.length > 0) {
            file.push(value, done);
          } else if (done) {
            file.push(new Uint8Array(0), true);          }
          
          if (done) break;
          
          // Small pause between chunks for GC to catch up
          if (value && value.length >= chunkSize) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        
        // Success is silent to reduce log spam
      } catch (streamError) {
        console.error(`[${taskId}] Stream processing error:`, streamError);
        throw streamError;
      } finally {
        // Cleanup reader
        try {
          reader.releaseLock();
        } catch (e) {
          // Ignore release lock errors
        }
      }
    } else {
      // Fallback for browsers without stream support
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      const file = new fflate.ZipDeflate(filename, { level: 3 });
      zip.add(file);
      file.push(data, true);
      
      console.log(`[${taskId}] ✅ Added: ${filename}`);
    }
    
  } catch (error) {
    console.error(`[${taskId}] Image processing error:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

