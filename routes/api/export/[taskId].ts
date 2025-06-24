// routes/api/export/[taskId].ts - 修复版下载端点

import { FreshContext, Handlers } from "$fresh/server.ts";
import * as fflate from "fflate";
import { getKv } from "../../../utils/kv.ts";
import { getExtensionFromResponse, formatDateForFilename, sanitizeFilename } from "../../../utils/fileUtils.ts";

interface TaskMeta {
  taskId: string;
  userToken: string; // Store a portion of the user token for identification
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
              
              // Check if the stream is still writable before trying to send an error
              try {
                // Ensure we can still write to the controller
                if (controller.desiredSize !== null && controller.desiredSize >= 0) {
                  // If the error is about concurrent processing, send a special response
                  if (error.message && error.message.includes('任务正在被另一个请求处理中')) {
                    const message = "下载处理中，请稍等一会再点击下载按钮...";
                    controller.enqueue(new TextEncoder().encode(message));
                    controller.close();
                  } else {
                    controller.error(error);
                  }
                } else {
                  // Stream is already closed or errored, just log it
                  console.log(`[${taskId}] Stream already closed, cannot send error`);
                }
              } catch (e) {
                console.error(`[${taskId}] 控制器错误:`, e);
              }
            }
          },
          
          // Handle client disconnection/abort events
          cancel(reason) {
            console.log(`[${taskId}] 🚫 Client disconnected: ${reason || 'Unknown reason'}`);
            
            // Clean up resources and release locks when client disconnects
            kv.delete(['task_lock', taskId]).catch(e => {
              console.error(`[${taskId}] Failed to release lock on disconnect:`, e);
            });
            
            // Store abort event in KV for tracking
            kv.set(['task_aborted', taskId], {
              timestamp: Date.now(),
              reason: String(reason || 'Client disconnected')
            }, { expireIn: 24 * 60 * 60 * 1000 }).catch(() => {});
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
  let abortChecker: number | null = null;
  let isClientConnected = true;
  
  // Set up a mechanism to check if the client is still connected
  const setupAbortChecker = () => {
    // Store a client state object to be shared across the process
    const clientState = { disconnected: false, lastActivity: Date.now() };
    
    // Function to check connection every few seconds
    const checkConnection = async () => {
      try {
        // Check for aborted task flag in KV
        const aborted = await kv.get(['task_aborted', taskId]);
        if (aborted.value) {
          console.log(`[${taskId}] 🛑 Task was previously aborted, stopping processing`);
          clientState.disconnected = true;
          return;
        }
        
        // Check if we can still write to the controller
        if (!controller.desiredSize || controller.desiredSize < 0) {
          console.log(`[${taskId}] 🚫 Client appears disconnected (controller closed)`);
          clientState.disconnected = true;
          
          // Clean up resources
          await kv.delete(['task_lock', taskId]).catch(() => {});
          
          // Record the abort event in KV
          await kv.set(['task_aborted', taskId], {
            timestamp: Date.now(),
            reason: 'Controller no longer writable'
          }, { expireIn: 24 * 60 * 60 * 1000 }).catch(() => {});
          
          return;
        }
        
        // If too much time has passed since last successful write, consider connection dead
        const timeSinceActivity = Date.now() - clientState.lastActivity;
        if (timeSinceActivity > 15000) { // 15 seconds of inactivity (reduced from 30)
          console.log(`[${taskId}] ⏱️ No client activity for ${Math.round(timeSinceActivity/1000)}s`);
          clientState.disconnected = true;
          
          // Clean up resources
          await kv.delete(['task_lock', taskId]).catch(() => {});
          
          // Record the abort event in KV
          await kv.set(['task_aborted', taskId], {
            timestamp: Date.now(),
            reason: 'Client inactivity timeout'
          }, { expireIn: 24 * 60 * 60 * 1000 }).catch(() => {});
          
          return;
        }
        
        // Still connected, schedule next check
        if (!clientState.disconnected) {
          setTimeout(checkConnection, 3000); // Check every 3 seconds
        }
      } catch (e) {
        // Don't log every connection check error
        setTimeout(checkConnection, 1000);
      }
    };
    
    // Start checking for disconnection
    setTimeout(checkConnection, 3000);
    
    // Return the client state for the rest of the process to check
    return clientState;
  };
  
  // Initialize client state tracker
  const clientState = setupAbortChecker();
  
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
        
        // 如果锁过期（2分钟），则强制释放
        if (lockAge > 2 * 60 * 1000) { 
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
          // 如果是最近的锁（10秒内），返回一个特殊响应而不是错误
          // 这样浏览器或下载管理器不会立即重试，给之前的请求一些时间完成
          if (lockAge < 10 * 1000) {
            console.log(`[${taskId}] ⏳ 任务刚刚开始处理 (${Math.round(lockAge/1000)}秒前)，返回重试响应`);
            controller.enqueue(new TextEncoder().encode("ZIP processing has just started. Please wait..."));
            controller.close();
            return; // Exit early without throwing an error
          }
          
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
          // Check for client disconnection before attempting to send data
          if (clientState.disconnected) {
            console.log(`[${taskId}] 📵 Client disconnected, stopping ZIP stream`);
            closed = true;
            return;
          }
          
          // Also check if the controller is still writable
          if (!controller.desiredSize || controller.desiredSize < 0) {
            console.log(`[${taskId}] ⚠️ Stream no longer writable, marking as disconnected`);
            closed = true;
            clientState.disconnected = true;
            return;
          }
          
          // Only enqueue if we're sure the client is still connected
          controller.enqueue(chunk);
          // Update last activity timestamp when we successfully write to the stream
          clientState.lastActivity = Date.now();
        } catch (e) {
          console.error(`[${taskId}] 控制器错误:`, e);
          closed = true;
          clientState.disconnected = true;
        }
      }
      
      if (final && !closed) {
        try {
          // One final check before closing
          if (!clientState.disconnected) {
            console.log(`[${taskId}] ✅ 完成`);
            controller.close();
          }
        } catch (e) {
          console.error(`[${taskId}] 关闭错误:`, e);
        } finally {
          closed = true;
        }
      }
    };    // 先处理元数据
    if (task.includeMetadata) {
      console.log(`[${taskId}] 📄 添加metadata.json`);
      
      // Check if client has disconnected before processing metadata
      if (clientState.disconnected) {
        console.log(`[${taskId}] 🛑 Skipping metadata due to client disconnection`);
      } else {
        await writeMetadataWithAbortCheck(zip, taskId, task, kv, clientState);
        
        if (!clientState.disconnected) {
          console.log(`[${taskId}] 🧹 从KV中清除元数据`);
          await clearMetadata(taskId, task, kv);
        }
      }
    }// 然后处理图片
    console.log(`[${taskId}] 📸 处理图片中`);
    let successCount = 0;
    let errorCount = 0;
    
    // Modified to pass client state and check for disconnection
    await processImagesWithAbortCheck(zip, taskId, task, kv, clientState, (success) => {
      if (success) {
        successCount++;
        if (successCount % 20 === 0 || successCount + errorCount === task.totalImages) {
          console.log(`[${taskId}] 📊 进度: ${successCount + errorCount}/${task.totalImages} (${errorCount}个错误)`);
        }
      } else {
        errorCount++;
      }
    });
    
    if (clientState.disconnected) {
      console.log(`[${taskId}] 🛑 Image processing aborted due to client disconnection`);
      // Don't finalize the ZIP since client is gone
      return;
    }
    
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
 * 修复版的图片处理函数 - 简化版本，无需单独跟踪每张图片的进度
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
      const batchImages = imageArray.slice(j, j + batchSize);      for (const img of batchImages) {
        try {
          // 处理主图
          await processImageWithRetry(img, zip, taskId, false);
          
        // 处理缩略图
          if (task.includeThumbnails && img.thumbnailUrl && img.thumbnailUrl !== img.url) {
            console.log(`[${taskId}] 🖼️ Processing thumbnail for ${img.id}`);
            await processImageWithRetry(img, zip, taskId, true);
          }
          
          processed++;
          if (progressCallback) {
            progressCallback(true);
          }
          
        } catch (error) {
          console.error(`[${taskId}] ❌ 失败 ${img.id}:`, error);
          
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
 * 带有中断检查的图片处理函数
 */
async function processImagesWithAbortCheck(
  zip: fflate.Zip, 
  taskId: string, 
  task: TaskMeta, 
  kv: Deno.Kv,
  clientState: { disconnected: boolean; lastActivity: number },
  progressCallback?: (success: boolean) => void
) {
  let processed = 0;
  let lastProgressLog = Date.now();
  let batchStart = Date.now();
  
  for (let i = 0; i < task.totalChunks; i++) {
    // Check if client has disconnected before processing each chunk
    if (clientState.disconnected) {
      console.log(`[${taskId}] 🛑 Aborting image processing due to client disconnection`);
      return;
    }
    
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
      // Check for disconnection before each batch
      if (clientState.disconnected) {
        console.log(`[${taskId}] 🛑 Aborting image batch due to client disconnection`);
        return;
      }
      
      const batchImages = imageArray.slice(j, j + batchSize);
      
      for (const img of batchImages) {
        try {
          // Check for disconnection before each image
          if (clientState.disconnected) {
            return;
          }
          
          // 处理主图
          await processImageWithRetry(img, zip, taskId, false);
          
          // 处理缩略图 - only process if includeThumbnails is true AND the thumbnailUrl exists
          if (task.includeThumbnails && img.thumbnailUrl && img.thumbnailUrl !== img.url) {
            // Check for disconnection before processing thumbnail
            if (clientState.disconnected) {
              return;
            }
            
            // Reduce log verbosity - don't log every thumbnail processing
            await processImageWithRetry(img, zip, taskId, true);
          }
          
          processed++;
          if (progressCallback) {
            progressCallback(true);
          }
          
          // Only log progress periodically instead of for every image
          const now = Date.now();
          if (now - lastProgressLog > 5000) { // Only log every 5 seconds
            const processingRate = processed / ((now - batchStart) / 1000);
            console.log(`[${taskId}] 📊 进度: ${processed}/${task.totalImages} (${processingRate.toFixed(1)}张/秒)`);
            lastProgressLog = now;
          }
          
        } catch (error) {
          console.error(`[${taskId}] ❌ 失败 ${img.id.slice(-8)}:`, error);
          
          if (progressCallback) {
            progressCallback(false);
          }
        }
      }
      
      // Record progress in KV so it can be resumed if needed
      try {
        await kv.set(['task_progress', taskId], { 
          completedChunks: i + 1,
          totalProcessed: processed,
          lastUpdate: Date.now()
        }, { expireIn: 24 * 60 * 60 * 1000 });
      } catch (e) {
        console.warn(`[${taskId}] Failed to save progress:`, e);
      }
    }
    
    imageArray.length = 0;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * 重试处理图片
 */
async function processImageWithRetry(img: ImageData, zip: fflate.Zip, taskId: string, isThumbnail: boolean, retries = 2) {
  // Get the appropriate URL based on whether we're processing a thumbnail or main image
  const url = isThumbnail ? img.thumbnailUrl : img.url;
  const imgId = img.id.slice(-8);
  
  // Skip invalid thumbnail URLs with a more thorough check
  if (isThumbnail) {
    if (!url || !url.startsWith('http')) {
      // Don't log every skipped thumbnail to reduce log spam
      return;
    }
  }
  
  let attempt = 0;
  let lastError: Error | null = null;
  
  while (attempt <= retries) {
    try {
      if (attempt > 0) {
        console.log(`[${taskId}] 🔄 Retry ${attempt}/${retries} for ${imgId}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
      
      await processImageStream(img, zip, taskId, isThumbnail);
      return;
      
    } catch (error) {
      lastError = error;
      console.error(`[${taskId}] ⚠️ Attempt ${attempt + 1} failed for ${imgId}`);
      attempt++;
      
      try {
        // @ts-ignore
        if (globalThis.gc) globalThis.gc();
      } catch (e) {}
    }
  }
  
  if (isThumbnail) {
    // Don't log every failed thumbnail to reduce log spam
    return; // Don't throw error for thumbnails, just skip them
  }
  
  throw lastError || new Error("Failed to process image after retries");
}

/**
 * 流式处理图片
 */
async function processImageStream(img: ImageData, zip: fflate.Zip, taskId: string, isThumbnail: boolean) {
  const url = isThumbnail ? img.thumbnailUrl! : img.url;
  const timeout = isThumbnail ? 15000 : 30000;
  const imgId = img.id.slice(-8); // Use shortened ID for logs to reduce verbosity
  
  // Use more concise logging to reduce verbosity
  console.log(`[${taskId}] ${isThumbnail ? '🖼️' : '🌐'} Fetching ${isThumbnail ? 'thumbnail' : 'image'} for ${imgId}`);
  
  // Skip invalid URLs
  if (!url || !url.startsWith('http')) {
    console.warn(`[${taskId}] ⚠️ Invalid URL for ${isThumbnail ? 'thumbnail' : 'image'}: ${imgId}`);
    return; // Skip this image instead of throwing an error
  }
  
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
    const id = imgId;
    const ext = getExtensionFromResponse(response, url);
    
    // Create folders inside the ZIP
    const folder = isThumbnail ? 'thumbnails' : 'images';
    const suffix = isThumbnail ? '_thumb' : '';
    const filename = `${folder}/${date}_${title}_${id}${suffix}.${ext}`;
    
    // More concise logging to avoid verbose output
    console.log(`[${taskId}] 📝 Adding: ${filename}`);
    
    if (response.body) {
      const file = new fflate.ZipDeflate(filename, { level: 3 });
      
      try {
        // Add the file to zip only after we've successfully fetched it
        zip.add(file);
        
        const reader = response.body.getReader();
        const chunkSize = 64 * 1024;
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (value && value.length > 0) {
              // Make sure we don't push any data if the stream is already in an error state
              try {
                file.push(value, done);
              } catch (pushError) {
                console.error(`[${taskId}] Error pushing data to ZIP:`, pushError);
                break;
              }
            } else if (done) {
              try {
                file.push(new Uint8Array(0), true);
              } catch (finalPushError) {
                console.error(`[${taskId}] Error finalizing ZIP entry:`, finalPushError);
              }
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
      } catch (zipError) {
        console.error(`[${taskId}] ZIP processing error:`, zipError);
        throw zipError;
      }
    } else {
      // For smaller responses that don't have a readable stream
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      try {
        const file = new fflate.ZipDeflate(filename, { level: 3 });
        zip.add(file);
        file.push(data, true);
      } catch (zipError) {
        console.error(`[${taskId}] ZIP processing error:`, zipError);
        throw zipError;
      }
    }
    
  } catch (error) {
    console.error(`[${taskId}] Processing error for ${imgId}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}