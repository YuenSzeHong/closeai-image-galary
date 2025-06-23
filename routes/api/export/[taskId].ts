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

export const handler: Handlers = {
  async GET(_req, ctx: FreshContext) {
    const taskId = ctx.params.taskId;
    console.log(`[${taskId}] 📥 Starting download`);

    try {
      const kv = await getKv();
      
      // 获取任务信息
      const taskResult = await kv.get<TaskMeta>(['tasks', taskId]);
      if (!taskResult.value) {
        return new Response('Task not found', { status: 404 });
      }
      
      const task = taskResult.value;
      console.log(`[${taskId}] 📊 Found ${task.totalImages} images in ${task.totalChunks} chunks`);
      
      // 创建流式响应
      const headers = new Headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${task.filename}"`,
        'Cache-Control': 'no-store, must-revalidate',
        'Accept-Ranges': 'none',
      });
      
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              await processTask(controller, taskId, task, kv);
            } catch (error) {
              console.error(`[${taskId}] Error:`, error);
              controller.error(error);
            }
          }
        }),
        { headers }
      );

    } catch (error) {
      console.error(`[${taskId}] Setup error:`, error);
      return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
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
    if (existingLock.value) {
      const lockAge = Date.now() - (existingLock.value as any).startTime;
      if (lockAge > 5 * 60 * 1000) { // 5分钟的僵尸锁
        console.warn(`[${taskId}] Removing stale lock (${Math.round(lockAge/1000)}s old)`);
        await kv.delete(lockKey);
        // 重试获取锁
        const retryResult = await kv.atomic()
          .check({ key: lockKey, versionstamp: null })
          .set(lockKey, { startTime: Date.now(), pid: crypto.randomUUID() }, { expireIn: 10 * 60 * 1000 })
          .commit();
        if (!retryResult.ok) {
          throw new Error('Task is already being processed by another request');
        }
      } else {
        throw new Error('Task is already being processed by another request');
      }
    }
  }
  
  console.log(`[${taskId}] 🔒 Acquired task lock`);
  
  let closed = false;
  
  const zip = new fflate.Zip();
  
  // 直接发送ZIP数据，不缓冲
  zip.ondata = (err, chunk, final) => {
    if (closed) return;
    
    if (err) {
      console.error(`[${taskId}] ZIP error:`, err);
      if (!closed) {
        closed = true;
        controller.error(new Error(`ZIP error: ${err.message}`));
      }
      return;
    }
    
    if (chunk && chunk.length > 0) {
      try {
        controller.enqueue(chunk);
      } catch (e) {
        console.error(`[${taskId}] Controller error:`, e);
        closed = true;
      }
    }
    
    if (final && !closed) {
      try {
        console.log(`[${taskId}] ✅ Completed`);
        controller.close();
      } catch (e) {
        console.error(`[${taskId}] Close error:`, e);
      } finally {
        closed = true;
      }
    }
  };

  try {
    // 🎯 方案B：先写元数据，立即清空KV
    if (task.includeMetadata) {
      console.log(`[${taskId}] 📄 Adding metadata.json`);
      await writeMetadata(zip, taskId, task, kv);
      
      console.log(`[${taskId}] 🧹 Clearing metadata from KV`);
      await clearMetadata(taskId, task, kv);
    }
    
    // 然后处理图片
    console.log(`[${taskId}] 📸 Processing images`);
    await processImages(zip, taskId, task, kv);
    
    // 完成ZIP
    zip.end();
    
  } catch (error) {
    console.error(`[${taskId}] Processing error:`, error);
    if (!closed) {
      closed = true;
      controller.error(error);
    }
  } finally {
    // 🔒 释放任务锁
    try {
      await kv.delete(['task_lock', taskId]);
      console.log(`[${taskId}] 🔓 Released task lock`);
    } catch (lockError) {
      console.error(`[${taskId}] Error releasing lock:`, lockError);
    }
  }
}

async function writeMetadata(zip: fflate.Zip, taskId: string, task: TaskMeta, kv: Deno.Kv) {
  const file = new fflate.ZipDeflate("metadata.json", { level: 1 });
  zip.add(file);
  
  // 开始JSON数组
  file.push(new TextEncoder().encode("[\n"), false);
  
  let first = true;
  for (let i = 0; i < task.totalChunks; i++) {
    const chunk = await kv.get<ImageData[]>(['meta_chunks', taskId, i]);
    if (!chunk.value) continue;
    
    for (const img of chunk.value) {
      const separator = first ? "" : ",\n";
      const json = separator + JSON.stringify({
        id: img.id,
        title: img.title,
        created_at: img.created_at,
        width: img.width,
        height: img.height,
        url: img.url,
        ...img.metadata
      }, null, 2);
      
      file.push(new TextEncoder().encode(json), false);
      first = false;
    }
  }
  
  // 结束JSON数组
  file.push(new TextEncoder().encode("\n]"), true);
}

async function clearMetadata(taskId: string, task: TaskMeta, kv: Deno.Kv) {
  const ops = kv.atomic();
  
  for (let i = 0; i < task.totalChunks; i++) {
    ops.delete(['meta_chunks', taskId, i]);
  }
  ops.delete(['meta_info', taskId]);
  
  await ops.commit();
}

async function processImages(zip: fflate.Zip, taskId: string, task: TaskMeta, kv: Deno.Kv) {
  let processed = 0;
  
  for (let i = 0; i < task.totalChunks; i++) {
    console.log(`[${taskId}] 📦 Chunk ${i + 1}/${task.totalChunks}`);
    
    const chunk = await kv.get<ImageData[]>(['img_chunks', taskId, i]);
    if (!chunk.value) continue;
    
    for (const img of chunk.value) {
      // 检查是否已处理
      const done = await kv.get(['done', taskId, img.id]);
      if (done.value) {
        console.log(`[${taskId}] 🔄 Skip: ${img.id}`);
        continue;
      }
      
      try {
        // 处理主图
        await processImage(img, zip, taskId, false);
        
        // 处理缩略图
        if (task.includeThumbnails && img.thumbnailUrl && img.thumbnailUrl !== img.url) {
          await processImage(img, zip, taskId, true);
        }
        
        // 标记完成
        await kv.set(['done', taskId, img.id], true, { expireIn: 2 * 60 * 60 * 1000 });
        
        processed++;
        console.log(`[${taskId}] ✅ ${processed}/${task.totalImages}: ${img.title}`);
        
        // 每5张强制GC
        if (processed % 5 === 0) {
          try {
            // @ts-ignore
            if (globalThis.gc) globalThis.gc();
          } catch {}
        }
        
      } catch (error) {
        console.error(`[${taskId}] ❌ Failed ${img.id}:`, error);
        await kv.set(['failed', taskId, img.id], { error: error.message, time: Date.now() });
      }
    }
    
    // chunk间暂停
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function processImage(img: ImageData, zip: fflate.Zip, taskId: string, isThumbnail: boolean) {
  const url = isThumbnail ? img.thumbnailUrl! : img.url;
  const timeout = isThumbnail ? 15000 : 30000;
  
  // 下载图片
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  let response: Response | null = null;
  let data: Uint8Array | null = null;
  
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'image/*' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    data = new Uint8Array(await response.arrayBuffer());
    
    // 生成文件名
    const date = formatDateForFilename(img.created_at);
    const title = sanitizeFilename(img.title, 50);
    const id = img.id.slice(-8);
    const ext = getExtensionFromResponse(response, url);
    
    const folder = isThumbnail ? 'thumbnails' : 'images';
    const suffix = isThumbnail ? '_thumb' : '';
    const filename = `${folder}/${date}_${title}_${id}${suffix}.${ext}`;
    
    // 添加到ZIP
    const file = new fflate.ZipDeflate(filename, { level: 3 });
    zip.add(file);
    file.push(data, true);
    
    console.log(`[${taskId}] ✅ Added: ${filename}`);
    
  } catch (error) {
    console.error(`[${taskId}] Image processing error:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    // 立即清理
    data = null;
    response = null;
  }
}