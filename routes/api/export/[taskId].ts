// routes/api/export/[taskId].ts - 最终修复版下载端点 (修正clientState重复声明)

import { FreshContext, Handlers } from "$fresh/server.ts";
import { downloadZip } from "client-zip";
import type { InputWithMeta, InputWithSizeMeta } from "client-zip";
import { getKv } from "../../../utils/kv.ts";
import {
  formatDateForFilename,
  getExtensionFromContentType,
  sanitizeFilename,
} from "../../../utils/fileUtils.ts";
import type {
  ActiveDownload,
  ImageData,
  TaskMeta,
} from "../../../types/export.ts";

// 全局管理活跃的下载连接 - 每个任务同时只允许一个下载
const activeDownloads = new Map<string, ActiveDownload>();

/**
 * Generate ZIP entries for client-zip with aggressive batching
 */
async function* generateZipEntries(
  download: ActiveDownload,
  task: TaskMeta,
  kv: Deno.Kv,
): AsyncGenerator<InputWithMeta | InputWithSizeMeta> {
  const { taskId } = download;

  console.log(`[${taskId}] 🚀 开始生成ZIP条目`);

  // Note: Individual JSON files are created alongside each image below

  // Detect file formats once by checking the first image
  console.log(`[${taskId}] 🔍 检测文件格式`);
  let mainImageExt = "png"; // fallback
  let thumbnailExt = "webp"; // fallback

  // Find first image to check formats
  let formatDetected = false;
  for (let i = 0; i < task.totalChunks && !formatDetected; i++) {
    const chunk = await kv.get<ImageData[]>(["img_chunks", taskId, i]);
    if (chunk.value && chunk.value.length > 0) {
      const firstImg = chunk.value[0];

      try {
        const headRequests = [fetch(firstImg.url, { method: "HEAD" })];
        if (
          task.includeThumbnails && firstImg.thumbnailUrl &&
          firstImg.thumbnailUrl.startsWith("http")
        ) {
          headRequests.push(fetch(firstImg.thumbnailUrl, { method: "HEAD" }));
        }

        const responses = await Promise.all(headRequests);
        mainImageExt = getExtensionFromContentType(
          responses[0].headers.get("content-type"),
          firstImg.url,
        );

        if (responses[1]) {
          thumbnailExt = getExtensionFromContentType(
            responses[1].headers.get("content-type"),
            firstImg.thumbnailUrl!,
          );
        }

        formatDetected = true;
        console.log(
          `[${taskId}] ✅ 格式检测完成: 主图=${mainImageExt}, 缩略图=${thumbnailExt}`,
        );
      } catch (_e) {
        console.warn(`[${taskId}] 格式检测失败，使用默认扩展名`);
        formatDetected = true; // Use defaults
      }
    }
  }

  // Process all image chunks with aggressive parallel batching
  console.log(`[${taskId}] 📸 开始处理${task.totalImages}张图片 (并行加载)`);

  let totalProcessed = 0;

  // Create all chunk loading promises at once
  const chunkPromises = Array.from(
    { length: task.totalChunks },
    (_, i) =>
      kv.get<ImageData[]>(["img_chunks", taskId, i]).then((chunk) => ({
        index: i,
        chunk,
      })),
  );

  // Process chunks as they become available using Promise.race
  const pendingPromises = new Set(chunkPromises);

  while (pendingPromises.size > 0) {
    // Check if this specific connection is still active
    const currentDownload = activeDownloads.get(taskId);
    if (
      !currentDownload || currentDownload.connectionId !== download.connectionId
    ) {
      console.log(`[${taskId}] 🛑 连接已被新连接取代，停止处理`);
      return;
    }

    try {
      // Wait for the next chunk to complete
      const { index, chunk } = await Promise.race(pendingPromises);

      // Remove the completed promise from pending set
      const completedPromise = chunkPromises[index];
      pendingPromises.delete(completedPromise);

      if (!chunk.value) {
        console.log(
          `[${taskId}] ⚠️ 数据块 ${index + 1}/${task.totalChunks} 为空`,
        );
        continue;
      }

      console.log(
        `[${taskId}] 📦 处理数据块 ${
          index + 1
        }/${task.totalChunks} (${chunk.value.length}张图片)`,
      );

      // Process each image in this chunk with proper error handling
      for (const img of chunk.value) {
        const currentDownload = activeDownloads.get(taskId);
        if (
          !currentDownload ||
          currentDownload.connectionId !== download.connectionId
        ) {
          console.log(`[${taskId}] 🛑 连接已被新连接取代，停止图片处理`);
          return;
        }

        const date = formatDateForFilename(img.created_at);
        const title = sanitizeFilename(img.title, 50);
        const id = img.id.slice(-8);
        const baseFilename = `${date}_${title}_${id}`;

        // Create individual metadata JSON for this image
        if (task.includeMetadata) {
          const imageMetadata = {
            ...img,
            created_at: new Date(img.created_at * 1000).toISOString(), // Convert to readable format
            exported_at: new Date().toISOString(),
          };

          yield {
            name: `${baseFilename}.json`,
            input: JSON.stringify(imageMetadata, null, 2),
          };
          totalProcessed++;
        }

        // Main image entry with proper async handling
        try {
          const response = await fetch(img.url);
          if (response.ok) {
            yield {
              name: `${baseFilename}.${mainImageExt}`,
              input: response,
            };
            totalProcessed++;
          } else {
            console.warn(
              `[${taskId}] Failed to fetch ${img.url}: ${response.status}`,
            );
          }
        } catch (err) {
          console.warn(`[${taskId}] Error fetching ${img.url}:`, err);
        }

        // Thumbnail entry if available
        if (
          task.includeThumbnails &&
          img.thumbnailUrl &&
          img.thumbnailUrl !== img.url &&
          img.thumbnailUrl.startsWith("http")
        ) {
          try {
            const response = await fetch(img.thumbnailUrl);
            if (response.ok) {
              yield {
                name: `${baseFilename}_thumb.${thumbnailExt}`,
                input: response,
              };
              totalProcessed++;
            } else {
              console.warn(
                `[${taskId}] Failed to fetch ${img.thumbnailUrl}: ${response.status}`,
              );
            }
          } catch (err) {
            console.warn(
              `[${taskId}] Error fetching ${img.thumbnailUrl}:`,
              err,
            );
          }
        }
      }

      console.log(
        `[${taskId}] ✅ 数据块 ${
          index + 1
        }/${task.totalChunks} 已提交 (累计${totalProcessed})`,
      );
    } catch (error) {
      console.error(`[${taskId}] 数据块加载错误:`, error);
      break;
    }
  }

  console.log(
    `[${taskId}] 🎉 所有${totalProcessed}个文件已提交给client-zip处理`,
  );

  // Clean up activeDownloads when generator completes
  activeDownloads.delete(taskId);
  console.log(`[${taskId}] 🧹 清理活跃下载连接`);
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
        console.log(
          `[${taskId}] 🔄 断开旧连接 (${
            existingDownload.connectionId.slice(-8)
          }, ${ageSeconds.toFixed(1)}秒前开始)`,
        );

        // 标记旧连接为断开
        existingDownload.disconnected = true;

        // 尝试关闭旧的控制器
        try {
          existingDownload.controller?.error(new Error("新连接接管"));
        } catch (e) {
          console.log(
            `[${taskId}] 旧控制器已关闭: ${e instanceof Error ? e.message : e}`,
          );
        }

        // 从活跃下载中移除
        activeDownloads.delete(taskId);
      }

      // 注册活跃下载
      const download: ActiveDownload = {
        taskId,
        connectionId,
        controller: null, // Will be set when stream starts
        startTime: Date.now(),
        userAgent: req.headers.get("user-agent") || undefined,
        isDownloadManager,
        disconnected: false,
      };
      activeDownloads.set(taskId, download);
      console.log(
        `[${taskId}] 🔗 注册活跃下载连接 (${connectionId.slice(-8)}) ${
          isDownloadManager ? "[IDM]" : "[浏览器]"
        }`,
      );

      try {
        // Generate ZIP using client-zip with streaming
        const zipResponse = downloadZip(generateZipEntries(download, task, kv));

        // Add filename header to the response
        const responseHeaders = new Headers(zipResponse.headers);
        responseHeaders.set(
          "Content-Disposition",
          `attachment; filename="${task.filename}"`,
        );

        return new Response(zipResponse.body, { headers: responseHeaders });
      } catch (error) {
        console.error(
          `[${taskId}] ZIP生成错误: ${
            error instanceof Error ? error.message : error
          }`,
          error,
        );

        // Clean up on error
        activeDownloads.delete(taskId);

        return new Response(
          `错误: ${error instanceof Error ? error.message : String(error)}`,
          { status: 500 },
        );
      }
    } catch (error) {
      console.error(`[${taskId}] GET 请求设置错误:`, error);
      return new Response(
        `错误: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 },
      );
    }
  },
};
