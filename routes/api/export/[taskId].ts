// routes/api/export/[taskId].ts - 最终修复版下载端点 (修正clientState重复声明)

import { FreshContext, Handlers } from "$fresh/server.ts";
import * as fflate from "fflate";
import { getKv } from "../../../utils/kv.ts";
import {
  formatDateForFilename,
  getExtensionFromResponse,
  sanitizeFilename,
} from "../../../utils/fileUtils.ts";

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
  finalZipSizeBytes?: number; // 新增：存储最终ZIP文件的大小，供HEAD请求使用
}

interface ActiveDownload {
  taskId: string;
  connectionId: string;
  controller: ReadableStreamDefaultController;
  startTime: number;
  userAgent?: string;
  isDownloadManager: boolean;
  disconnected: boolean;
}

// 全局管理活跃的下载连接 - 每个任务同时只允许一个下载
const activeDownloads = new Map<string, ActiveDownload>();

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
  // --- 新增 Handlers.HEAD 方法 ---
  async HEAD(_req, ctx: FreshContext) {
    const taskId = ctx.params.taskId;
    console.log(`[${taskId}] 🔍 收到 HEAD 请求`);

    try {
      const kv = await getKv();
      const taskResult = await kv.get<TaskMeta>(["tasks", taskId]);

      if (!taskResult.value) {
        console.warn(`[${taskId}] ⚠️ HEAD 请求：任务未找到`);
        return new Response("任务未找到", { status: 404 });
      }

      const task = taskResult.value;

      // 构建头部信息
      const headers = new Headers({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${task.filename}"`,
        "Cache-Control": "no-store, must-revalidate",
        "Accept-Ranges": "none", // 我们不是一个支持范围请求的服务器，所以声明不支持
        "X-Content-Type-Options": "nosniff",
      });

      // 只有当 finalZipSizeBytes 存在时才设置 Content-Length
      if (task.finalZipSizeBytes !== undefined) {
        headers.set("Content-Length", String(task.finalZipSizeBytes));
        console.log(
          `[${taskId}] ✅ HEAD 响应：文件大小 ${task.finalZipSizeBytes} 字节`,
        );
      } else {
        console.warn(
          `[${taskId}] ⚠️ HEAD 响应：未找到文件大小，无法设置 Content-Length`,
        );
      }

      return new Response(null, { status: 200, headers });
    } catch (error) {
      console.error(`[${taskId}] HEAD 请求错误:`, error);
      return new Response("服务器错误", { status: 500 });
    }
  },
  // --- Handlers.HEAD 结束 ---

  async GET(req, ctx: FreshContext) {
    const taskId = ctx.params.taskId;
    const connectionId = crypto.randomUUID();

    // 检测是否为IDM或类似下载工具
    const acceptEncoding = req.headers.get("accept-encoding") || "";
    const hasSecFetch = req.headers.has("sec-fetch-dest");
    const isDownloadManager = acceptEncoding.includes("identity") &&
      !hasSecFetch;

    console.log(
      `[${taskId}] 📥 开始下载 (连接ID: ${connectionId.slice(-8)}) ${
        isDownloadManager ? "[IDM]" : "[浏览器]"
      }`,
    );

    try {
      const kv = await getKv();

      // 获取任务信息
      const taskResult = await kv.get<TaskMeta>(["tasks", taskId]);
      if (!taskResult.value) {
        console.warn(`[${taskId}] ⚠️ GET 请求：任务未找到`);
        return new Response("任务未找到", { status: 404 });
      }

      const task = taskResult.value;
      console.log(
        `[${taskId}] 📊 找到${task.totalImages}张图片，分布在${task.totalChunks}个数据块中`,
      );

      // 检查是否已有活跃的下载连接 - 如果有则断开旧连接
      const existingDownload = activeDownloads.get(taskId);
      if (existingDownload) {
        const ageSeconds = (Date.now() - existingDownload.startTime) / 1000;
        console.log(`[${taskId}] 🔄 断开旧连接 (${existingDownload.connectionId.slice(-8)}, ${ageSeconds.toFixed(1)}秒前开始)`);
        
        // 标记旧连接为断开
        existingDownload.disconnected = true;
        
        // 尝试关闭旧的控制器
        try {
          existingDownload.controller.error(new Error("新连接接管"));
        } catch (e) {
          console.log(`[${taskId}] 旧控制器已关闭: ${e instanceof Error ? e.message : e}`);
        }
        
        // 从活跃下载中移除
        activeDownloads.delete(taskId);
      }

      // 创建流式响应
      const headers = new Headers({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${task.filename}"`,
        "Cache-Control": "no-store, must-revalidate",
        "Accept-Ranges": "none", // 告诉IDM不支持范围请求
        "X-Content-Type-Options": "nosniff",
        "Transfer-Encoding": "chunked",
        "Connection": "close", // 告诉IDM这是单线程连接
      });

      return new Response(
        new ReadableStream({
          async start(controller) {
            // 注册活跃下载
            const download: ActiveDownload = {
              taskId,
              connectionId,
              controller,
              startTime: Date.now(),
              userAgent: req.headers.get("user-agent") || undefined,
              isDownloadManager,
              disconnected: false,
            };
            activeDownloads.set(taskId, download);
            console.log(`[${taskId}] 🔗 注册活跃下载连接 (${connectionId.slice(-8)}) ${isDownloadManager ? "[IDM]" : "[浏览器]"}`);

            try {
              await processTaskSafely(
                download,
                task,
                kv,
              );
            } catch (error) {
              console.error(`[${taskId}] 流处理错误: ${error instanceof Error ? error.message : error}`, error);

              // Check if the stream is still writable before trying to send an error
              try {
                // Ensure we can still write to the controller
                if (
                  controller.desiredSize !== null && controller.desiredSize >= 0
                ) {
                  try {
                    controller.error(error);
                  } catch (_controllerError) {
                    console.log(`[${taskId}] 控制器已关闭，无法发送错误`);
                  }
                } else {
                  // Stream is already closed or errored, just log it
                  console.log(
                    `[${taskId}] Stream already closed, cannot send error`,
                  );
                }
              } catch (e) {
                console.error(`[${taskId}] 控制器错误:`, e);
              }
            }
          },

          // Handle client disconnection/abort events
          async cancel(reason) {
            console.log(
              `[${taskId}] 🚫 客户端已断开连接 (${connectionId.slice(-8)}): ${
                reason || "未知原因"
              }`,
            );

            // 标记连接为断开
            const activeDownload = activeDownloads.get(taskId);
            if (activeDownload && activeDownload.connectionId === connectionId) {
              activeDownload.disconnected = true;
              activeDownloads.delete(taskId);
              console.log(`[${taskId}] 🧹 清理活跃下载连接 (${connectionId.slice(-8)})`);
            }
          },
        }),
        { headers },
      );
    } catch (error) {
      console.error(`[${taskId}] GET 请求设置错误:`, error);
      return new Response(
        `错误: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 },
      );
    }
  },
};




/**
 * 安全的任务处理
 */
async function processTaskSafely(
  download: ActiveDownload,
  task: TaskMeta,
  kv: Deno.Kv,
) {
  const { taskId, connectionId, controller } = download;

  try {
    let closed = false;

    // 配置低压缩ZIP以减少CPU使用
    const zip = new fflate.Zip();

    // 立即发送ZIP数据块
    zip.ondata = (err, chunk, final) => {
      if (closed) return;

      if (err) {
        console.error(`[${taskId}] ZIP错误:`, err);
        if (!closed) {
          closed = true;
          try {
            controller.error(new Error(`ZIP错误: ${err.message}`));
          } catch (_controllerError) {
            console.log(`[${taskId}] 控制器已关闭，无法发送ZIP错误`);
          }
        }
        return;
      }

      if (chunk && chunk.length > 0) {
        try {
          // Check for client disconnection before attempting to send data
          if (download.disconnected) {
            console.log(`[${taskId}] 📵 客户端已断开连接，停止ZIP流发送`);
            closed = true;
            return;
          }

          // Also check if the controller is still writable
          if (!controller.desiredSize || controller.desiredSize < 0) {
            console.log(`[${taskId}] ⚠️ 流不再可写，标记为已断开连接并停止发送`);
            closed = true;
            download.disconnected = true;
            return;
          }

          // Only enqueue if we're sure the client is still connected
          try {
            controller.enqueue(chunk);
          } catch (_enqueueError) {
            console.log(`[${taskId}] ⚠️ 控制器已关闭，无法发送数据块`);
            closed = true;
            download.disconnected = true;
            return;
          }
        } catch (e) {
          console.error(`[${taskId}] 控制器写入错误:`, e);
          closed = true;
          download.disconnected = true;
        }
      }

      if (final && !closed) {
        try {
          // One final check before closing
          if (!download.disconnected) {
            console.log(`[${taskId}] ✅ 完成`);
            controller.close();
          }
        } catch (e) {
          console.error(`[${taskId}] 关闭流错误:`, e);
        } finally {
          closed = true;
        }
      }
    };

    // 给用户时间确认保存
    console.log(`[${taskId}] ⏳ 等待用户确认保存 (3秒)`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 检查客户端是否还在连接
    if (download.disconnected) {
      console.log(`[${taskId}] 🛑 客户端已断开，停止处理`);
      return;
    }

    console.log(`[${taskId}] 🚀 开始处理内容`);

    // 先处理元数据
    if (task.includeMetadata) {
      console.log(`[${taskId}] 📄 添加metadata.json`);

      // Check if client has disconnected before processing metadata
      if (download.disconnected) {
        console.log(`[${taskId}] 🛑 跳过元数据处理，客户端已断开连接`);
      } else {
        await writeMetadataWithAbortCheck(
          zip,
          taskId,
          task,
          kv,
          download,
        );

        if (!download.disconnected) { // 只有在连接未断开时才清理元数据
          console.log(`[${taskId}] 🧹 从KV中清除元数据`);
          await clearMetadata(taskId, task, kv);
        }
      }
    } // 然后处理图片
    console.log(`[${taskId}] 📸 处理图片中`);
    let successCount = 0;
    let errorCount = 0;

    // Modified to pass client state and check for disconnection
    await processImagesWithAbortCheck(
      zip,
      taskId,
      task,
      kv,
      download,
      (success) => {
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
      },
    );

    if (download.disconnected) {
      console.log(`[${taskId}] 🛑 图片处理中止，客户端已断开连接`);
      // Don't finalize the ZIP since client is gone
      return;
    }

    console.log(
      `[${taskId}] 📊 最终结果: ${
        successCount + errorCount
      }/${task.totalImages} 完成 (${errorCount}个错误)`,
    );

    // 完成ZIP
    zip.end();
  } catch (error) {
    console.error(`[${taskId}] 任务处理发生错误:`, error); // 日志修正
    throw error;
  } finally {
    // Task processing cleanup completed
  }
}

/**
 * 带有中断检查的元数据写入函数
 */
async function writeMetadataWithAbortCheck(
  zip: fflate.Zip,
  taskId: string,
  task: TaskMeta,
  kv: Deno.Kv,
  download: ActiveDownload,
) {
  // Check for client disconnection before starting
  if (download.disconnected) {
    console.log(`[${taskId}] 🛑 跳过元数据处理，客户端已断开连接`);
    return;
  }

  console.log(`[${taskId}] 📄 处理metadata.json`);

  // 获取元数据信息
  const metaInfo = await kv.get(["meta_info", taskId]);
  if (!metaInfo.value) {
    console.warn(`[${taskId}] ⚠️ 未找到元数据信息，跳过元数据处理`);
    return;
  }

  // Initialize an array to hold all image metadata
  const allImageData: ImageData[] = [];

  // Process each metadata chunk
  for (let i = 0; i < task.totalChunks; i++) {
    // Check for disconnection before each chunk
    if (download.disconnected) {
      console.log(`[${taskId}] 🛑 元数据处理中止，客户端已断开连接`);
      return;
    }

    // Retrieve the metadata chunk
    const chunk = await kv.get<ImageData[]>(["meta_chunks", taskId, i]);
    if (!chunk.value) {
      console.warn(
        `[${taskId}] ⚠️ 未找到元数据块 ${i + 1}/${task.totalChunks}，跳过`,
      );
      continue;
    }

    // Add this chunk's data to the full array
    allImageData.push(...chunk.value);

    // Clear the reference - we've already copied the data to allImageData
    // No need to set chunk.value to null as it can cause type errors

    // Force garbage collection periodically
    if (i % 5 === 0 && i > 0) {
      try {
        // @ts-ignore: gc is not a standard API but might be available
        if (globalThis.gc) globalThis.gc();
      } catch (_e) {
        // Ignore GC errors - not all environments support it
      }

      // Ensure we're still connected
      if (download.disconnected) {
        console.log(`[${taskId}] 🛑 元数据处理中止，客户端已断开连接`);
        return;
      }

      // Add a small delay to prevent memory pressure
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Check for disconnection before writing file
  if (download.disconnected) {
    console.log(`[${taskId}] 🛑 元数据写入中止，客户端已断开连接`);
    return;
  }

  // Write the metadata to the ZIP
  try {
    console.log(
      `[${taskId}] 📝 写入 metadata.json，包含 ${allImageData.length} 个条目`,
    );

    // Convert metadata to JSON
    const metadataJson = JSON.stringify(
      {
        images: allImageData,
        count: allImageData.length,
        exported_at: new Date().toISOString(),
        version: "1.0",
      },
      null,
      2,
    );

    // Add metadata.json to the ZIP
    const metadataFile = new fflate.ZipDeflate("metadata.json", { level: 3 });
    zip.add(metadataFile);
    metadataFile.push(new TextEncoder().encode(metadataJson), true);

    console.log(`[${taskId}] ✅ 元数据写入成功`);
  } catch (error) {
    console.error(`[${taskId}] ❌ 写入元数据错误:`, error);
    throw error;
  } finally {
    // Clear metadata array to help with garbage collection
    allImageData.length = 0;

    try {
      // @ts-ignore: gc is not a standard API but might be available
      if (globalThis.gc) globalThis.gc();
    } catch (_e) {
      // Ignore GC errors - not all environments support it
    }
  }
}

/**
 * 清理元数据
 */
async function clearMetadata(taskId: string, task: TaskMeta, kv: Deno.Kv) {
  try {
    console.log(`[${taskId}] 🧹 清理元数据`);

    // Delete metadata info
    await kv.delete(["meta_info", taskId]);

    // Delete all metadata chunks
    for (let i = 0; i < task.totalChunks; i++) {
      await kv.delete(["meta_chunks", taskId, i]);
    }

    console.log(`[${taskId}] ✅ 元数据已清理`);
  } catch (error) {
    console.warn(`[${taskId}] ⚠️ 清理元数据错误:`, error);
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
  download: ActiveDownload,
  progressCallback?: (success: boolean) => void,
) {
  let processed = 0;
  const batchStart = Date.now();

  for (let i = 0; i < task.totalChunks; i++) {
    // Check if client has disconnected before processing each chunk
    if (download.disconnected) {
      console.log(`[${taskId}] 🛑 中止图片处理，客户端已断开连接`);
      return;
    }

    // Only log progress periodically instead of for every image
    const now = Date.now();
    const elapsedSeconds = (now - batchStart) / 1000;

    const processingRate = elapsedSeconds > 0 && processed > 0
      ? processed / elapsedSeconds
      : 0;
    console.log(
      `[${taskId}] 📦 数据块 ${i + 1}/${task.totalChunks} (${
        processingRate.toFixed(1)
      }张/秒)`,
    );

    // 强制垃圾回收
    try {
      // @ts-ignore: gc is not a standard API but might be available
      if (globalThis.gc) globalThis.gc();
    } catch (_e) {
      // Ignore GC errors - not all environments support it
    }

    // 获取数据块
    const chunk = await kv.get<ImageData[]>(["img_chunks", taskId, i]);
    if (!chunk.value) continue;

    const batchSize = 3;
    const imageArray = [...chunk.value];
    // No need to clear chunk.value reference here

    for (let j = 0; j < imageArray.length; j += batchSize) {
      // Check for disconnection before each batch
      if (download.disconnected) {
        console.log(`[${taskId}] 🛑 中止图片批处理，客户端已断开连接`);
        return;
      }

      const batchImages = imageArray.slice(j, j + batchSize);

      for (const img of batchImages) {
        try {
          // Check for disconnection before each image
          if (download.disconnected) {
            return;
          }

          // 处理主图
          await processImageWithRetry(img, zip, taskId, false);

          // 处理缩略图 - only process if includeThumbnails is true AND the thumbnailUrl exists
          if (
            task.includeThumbnails && img.thumbnailUrl &&
            img.thumbnailUrl !== img.url
          ) {
            // Check for disconnection before processing thumbnail
            if (download.disconnected) {
              return;
            }

            // Reduce log verbosity - don't log every thumbnail processing
            await processImageWithRetry(img, zip, taskId, true);
          }

          processed++;
          if (progressCallback) {
            progressCallback(true);
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
        await kv.set(["task_progress", taskId], {
          completedChunks: i + 1,
          totalProcessed: processed,
          lastUpdate: Date.now(),
        }, { expireIn: 24 * 60 * 60 * 1000 });
      } catch (e) {
        console.warn(`[${taskId}] 保存进度失败:`, e);
      }
    }

    imageArray.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/**
 * 重试处理图片
 */
async function processImageWithRetry(
  img: ImageData,
  zip: fflate.Zip,
  taskId: string,
  isThumbnail: boolean,
  retries = 2,
) {
  // Get the appropriate URL based on whether we're processing a thumbnail or main image
  const url = isThumbnail ? img.thumbnailUrl : img.url;
  const imgId = img.id.slice(-8);

  // Skip invalid thumbnail URLs with a more thorough check
  if (isThumbnail) {
    if (!url || !url.startsWith("http")) {
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
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempt - 1))
        );
      }

      await processImageStream(img, zip, taskId, isThumbnail);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[${taskId}] ⚠️ Attempt ${attempt + 1} failed for ${imgId}`,
      );
      attempt++;

      try {
        // @ts-ignore: gc is not a standard API but might be available
        if (globalThis.gc) globalThis.gc();
      } catch (_e) {
        // Ignore GC errors - not all environments support it
      }
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
async function processImageStream(
  img: ImageData,
  zip: fflate.Zip,
  taskId: string,
  isThumbnail: boolean,
) {
  const url = isThumbnail ? img.thumbnailUrl! : img.url;
  const timeout = isThumbnail ? 15000 : 30000;
  const imgId = img.id.slice(-8); // Use shortened ID for logs to reduce verbosity

  // Skip invalid URLs
  if (!url || !url.startsWith("http")) {
    console.warn(
      `[${taskId}] ⚠️ Invalid URL for ${
        isThumbnail ? "thumbnail" : "image"
      }: ${imgId}`,
    );
    return; // Skip this image instead of throwing an error
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "image/*" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const date = formatDateForFilename(img.created_at);
    const title = sanitizeFilename(img.title, 50);
    const id = imgId;
    const ext = getExtensionFromResponse(response, url);

    // Create folders inside the ZIP
    const folder = isThumbnail ? "thumbnails" : "images";
    const suffix = isThumbnail ? "_thumb" : "";
    const filename = `${folder}/${date}_${title}_${id}${suffix}.${ext}`;

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
                console.error(
                  `[${taskId}] Error pushing data to ZIP:`,
                  pushError,
                );
                break;
              }
            } else if (done) {
              try {
                file.push(new Uint8Array(0), true);
              } catch (finalPushError) {
                console.error(
                  `[${taskId}] Error finalizing ZIP entry:`,
                  finalPushError,
                );
              }
            }

            if (done) break;

            if (value && value.length >= chunkSize) {
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
          }
        } catch (streamError) {
          console.error(`[${taskId}] Stream processing error:`, streamError);
          throw streamError;
        } finally {
          try {
            reader.releaseLock();
          } catch (_e) {
            // Ignore errors when releasing the lock
          }
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
