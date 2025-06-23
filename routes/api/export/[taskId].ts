// routes/api/export/[taskId].ts - 修复版下载端点

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
  status: "preparing" | "ready" | "failed";
  createdAt: number;
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

export const handler: Handlers = {
  async GET(_req, ctx: FreshContext) {
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

      // 清理可能存在的僵尸锁（重启后的锁都是无效的）
      await cleanupZombieLocks(taskId, kv);

      // 创建流式响应
      const headers = new Headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${task.filename}"`,
        'Cache-Control': 'no-store, must-revalidate',
        'Accept-Ranges': 'none',
        'X-Content-Type-Options': 'nosniff',
        'Transfer-Encoding': 'chunked',
      });
      
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              await processTaskSafely(controller, taskId, task, kv);
            } catch (error) {
              console.error(`[${taskId}] 错误:`, error);
              
              // 确保清理锁
              await kv.delete(['task_lock', taskId]).catch(() => {});
              
              if (!controller.desiredSize || controller.desiredSize <= 0) {
                return;
              }
              
              try {
                controller.error(error);
              } catch (e) {
                console.error(`[${taskId}] 控制器错误:`, e);
              }
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

/**
 * 清理僵尸锁
 */
async function cleanupZombieLocks(taskId: string, kv: Deno.Kv): Promise<void> {
  try {
    const lockKey = ['task_lock', taskId];
    const existingLock = await kv.get(lockKey);
    
    if (existingLock.value) {
      const lockAge = Date.now() - ((existingLock.value as any).startTime || 0);
      // 超过2分钟的锁认为是僵尸锁
      if (lockAge > 2 * 60 * 1000) {
        console.log(`[${taskId}] 🧹 清理僵尸锁 (${Math.round(lockAge/1000)}秒前)`);
        await kv.delete(lockKey);
      }
    }
  } catch (error) {
    console.warn(`[${taskId}] 清理僵尸锁失败:`, error);
  }
}

/**
 * 安全的任务处理
 */
async function processTaskSafely(
  controller: ReadableStreamDefaultController,
  taskId: string,
  task: TaskMeta,
  kv: Deno.Kv
) {
  let lockAcquired = false;
  
  try {
    // 🔒 尝试获取任务锁，使用更短的超时
    const lockKey = ['task_lock', taskId];
    const lockData = { startTime: Date.now(), pid: crypto.randomUUID() };
    
    const lockResult = await kv.atomic()
      .check({ key: lockKey, versionstamp: null })
      .set(lockKey, lockData, { expireIn: 5 * 60 * 1000 }) // 5分钟锁
      .commit();
    
    if (!lockResult.ok) {
      // 检查锁的年龄，如果太老直接抢占
      const existingLock = await kv.get(lockKey);
      if (existingLock.value) {
        const lockAge = Date.now() - ((existingLock.value as any).startTime || 0);
        if (lockAge > 2 * 60 * 1000) { // 2分钟
          console.warn(`[${taskId}] 抢占过期锁 (${Math.round(lockAge/1000)}秒)`);
          await kv.delete(lockKey);
          
          const retryResult = await kv.atomic()
            .check({ key: lockKey, versionstamp: null })
            .set(lockKey, lockData, { expireIn: 5 * 60 * 1000 })
            .commit();
            
          if (!retryResult.ok) {
            throw new Error('无法获取任务锁');
          }
          lockAcquired = true;
        } else {
          throw new Error('任务正在被另一个请求处理中');
        }
      } else {
        throw new Error('无法获取任务锁');
      }
    } else {
      lockAcquired = true;
    }
    
    console.log(`[${taskId}] 🔒 获取任务锁`);
    
    let closed = false;
    
    // 配置低压缩ZIP以减少CPU使用
    const zip = new fflate.Zip({
      level: 1,
      mem: 8
    });
    
    // 立即发送ZIP数据块
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

    // 先处理元数据
    if (task.includeMetadata) {
      console.log(`[${taskId}] 📄 添加metadata.json`);
      await writeMetadata(zip, taskId, task, kv);
      
      console.log(`[${taskId}] 🧹 从KV中清除元数据`);
      await clearMetadata(taskId, task, kv);
    }

    // 然后处理图片
    console.log(`[${taskId}] 📸 处理图片中`);
    let successCount = 0;
    let errorCount = 0;
    
    await processImagesFixed(zip, taskId, task, kv, (success) => {
      if (success) {
        successCount++;
        if (successCount % 20 === 0 || successCount + errorCount === task.totalImages) {
          console.log(`[${taskId}] 📊 进度: ${successCount + errorCount}/${task.totalImages} (${errorCount}个错误)`);
        }
      } else {
        errorCount++;
      }
    });
    
    console.log(`[${taskId}] 📊 最终结果: ${successCount + errorCount}/${task.totalImages} 完成 (${errorCount}个错误)`);
    
    // 完成ZIP
    zip.end();
    
  } catch (error) {
    console.error(`[${taskId}] 处理错误:`, error);
    throw error;
  } finally {
    // 🔒 释放任务锁
    if (lockAcquired) {
      try {
        await kv.delete(['task_lock', taskId]);
        console.log(`[${taskId}] 🔓 释放任务锁`);
      } catch (lockError) {
        console.error(`[${taskId}] 释放锁错误:`, lockError);
      }
    }
  }
}

/**
 * 修复版的图片处理函数
 */
async function processImagesFixed(
  zip: fflate.Zip, 
  taskId: string, 
  task: TaskMeta, 
  kv: Deno.Kv,
  progressCallback?: (success: boolean) => void
) {
  let processed = 0;
  
  for (let i = 0; i < task.totalChunks; i++) {
    console.log(`[${taskId}] 📦 数据块 ${i + 1}/${task.totalChunks}`);
    
    // 强制垃圾回收
    try {
      // @ts-ignore
      if (globalThis.gc) globalThis.gc();
    } catch (e) {}
    
    // 获取数据块
    const chunk = await kv.get<ImageData[]>(['img_chunks', taskId, i]);
    if (!chunk.value) continue;
    
    const batchSize = 3;
    const imageArray = [...chunk.value];
    chunk.value = null; // 立即清理引用
    
    for (let j = 0; j < imageArray.length; j += batchSize) {
      const batchImages = imageArray.slice(j, j + batchSize);
      
      for (const img of batchImages) {
        // 🔧 修复：检查任务是否已完成（这里修复了 done 变量问题）
        const completionStatus = await kv.get(['done', taskId, img.id]);
        if (completionStatus.value) {
          processed++;
          if (progressCallback) {
            progressCallback(true);
          }
          continue;
        }
        
        try {
          // 处理主图
          await processImageWithRetry(img, zip, taskId, false);
          
          // 处理缩略图
          if (task.includeThumbnails && img.thumbnailUrl && img.thumbnailUrl !== img.url) {
            await processImageWithRetry(img, zip, taskId, true);
          }
          
          // 标记为完成
          await kv.set(['done', taskId, img.id], true, { expireIn: 2 * 60 * 60 * 1000 });
          
          processed++;
          if (progressCallback) {
            progressCallback(true);
          }
          
          // 强制垃圾回收
          try {
            // @ts-ignore
            if (globalThis.gc) globalThis.gc();
          } catch (e) {}
          
        } catch (error) {
          console.error(`[${taskId}] ❌ 失败 ${img.id}:`, error);
          await kv.set(['failed', taskId, img.id], { error: error.message, time: Date.now() });
          
          if (progressCallback) {
            progressCallback(false);
          }
        }
      }
      
      batchImages.length = 0;
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        // @ts-ignore
        if (globalThis.gc) globalThis.gc();
      } catch (e) {}
    }
    
    imageArray.length = 0;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * 写入元数据到ZIP
 */
async function writeMetadata(zip: fflate.Zip, taskId: string, task: TaskMeta, kv: Deno.Kv) {
  const file = new fflate.ZipDeflate("metadata.json", { level: 1 });
  zip.add(file);
  
  file.push(new TextEncoder().encode("[\n"), false);
  
  let first = true;
  const encoder = new TextEncoder();
  
  for (let i = 0; i < task.totalChunks; i++) {
    const chunk = await kv.get<ImageData[]>(['meta_chunks', taskId, i]);
    if (!chunk.value) continue;
    
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
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    chunk.value = null;
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      // @ts-ignore
      if (globalThis.gc) globalThis.gc();
    } catch (e) {}
  }
  
  file.push(new TextEncoder().encode("\n]"), true);
}

/**
 * 清理元数据
 */
async function clearMetadata(taskId: string, task: TaskMeta, kv: Deno.Kv) {
  const batchSize = 5;
  
  for (let i = 0; i < task.totalChunks; i += batchSize) {
    const ops = kv.atomic();
    const end = Math.min(i + batchSize, task.totalChunks);
    
    for (let j = i; j < end; j++) {
      ops.delete(['meta_chunks', taskId, j]);
    }
    
    await ops.commit();
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  await kv.delete(['meta_info', taskId]);
}

/**
 * 重试处理图片
 */
async function processImageWithRetry(img: ImageData, zip: fflate.Zip, taskId: string, isThumbnail: boolean, retries = 2) {
  let attempt = 0;
  let lastError: Error | null = null;
  
  while (attempt <= retries) {
    try {
      if (attempt > 0) {
        console.log(`[${taskId}] 🔄 Retry ${attempt}/${retries} for ${img.id}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
      
      await processImageStream(img, zip, taskId, isThumbnail);
      return;
      
    } catch (error) {
      lastError = error;
      console.error(`[${taskId}] ⚠️ Attempt ${attempt + 1} failed for ${img.id}:`, error);
      attempt++;
      
      try {
        // @ts-ignore
        if (globalThis.gc) globalThis.gc();
      } catch (e) {}
    }
  }
  
  throw lastError || new Error("Failed to process image after retries");
}

/**
 * 流式处理图片
 */
async function processImageStream(img: ImageData, zip: fflate.Zip, taskId: string, isThumbnail: boolean) {
  const url = isThumbnail ? img.thumbnailUrl! : img.url;
  const timeout = isThumbnail ? 15000 : 30000;
  
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
    
    const date = formatDateForFilename(img.created_at);
    const title = sanitizeFilename(img.title, 50);
    const id = img.id.slice(-8);
    const ext = getExtensionFromResponse(response, url);
    
    const folder = isThumbnail ? 'thumbnails' : 'images';
    const suffix = isThumbnail ? '_thumb' : '';
    const filename = `${folder}/${date}_${title}_${id}${suffix}.${ext}`;
    
    if (response.body) {
      const file = new fflate.ZipDeflate(filename, { level: 3 });
      zip.add(file);
      
      const reader = response.body.getReader();
      const chunkSize = 64 * 1024;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (value && value.length > 0) {
            file.push(value, done);
          } else if (done) {
            file.push(new Uint8Array(0), true);
          }
          
          if (done) break;
          
          if (value && value.length >= chunkSize) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        
      } catch (streamError) {
        console.error(`[${taskId}] Stream processing error:`, streamError);
        throw streamError;
      } finally {
        try {
          reader.releaseLock();
        } catch (e) {}
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      const file = new fflate.ZipDeflate(filename, { level: 3 });
      zip.add(file);
      file.push(data, true);
    }
    
  } catch (error) {
    console.error(`[${taskId}] Image processing error:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}