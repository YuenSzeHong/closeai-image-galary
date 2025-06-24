// routes/api/export.ts - 配合新KV结构的版本
import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import { createChatGPTClient, type ImageItem } from "../../lib/chatgpt-client.ts";
import { getKv } from "../../utils/kv.ts";
import { formatDateForFilename } from "../../utils/fileUtils.ts";

const ExportRequest = z.object({
  token: z.string().min(10),
  teamId: z.string().optional(),
  includeMetadata: z.boolean().default(true),
  includeThumbnails: z.boolean().default(true),
});

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
  async POST(req, _ctx) {
    try {
      const body = await req.json();
      const { token, teamId, includeMetadata, includeThumbnails } = ExportRequest.parse(body);
      
      const taskId = crypto.randomUUID();
      const kv = await getKv();
        console.log(`[${taskId}] 🚀 开始导出任务`);
        // 检查现有任务
      const existing = await checkExistingTask(token, teamId, kv);
      if (existing) {
        // 检查任务是否正在被处理
        const isProcessing = await isTaskBeingProcessed(existing.taskId, kv);
        
        console.log(`[${taskId}] 🎯 找到现有任务: ${existing.taskId}${isProcessing ? ' (正在处理中)' : ''}`);
        return Response.json({
          type: "existing_task_found",
          taskId: existing.taskId,
          filename: existing.filename,
          downloadUrl: `/api/export/${existing.taskId}`,
          totalImages: existing.totalImages,
          isProcessing: isProcessing,
          ageHours: Math.round((Date.now() - existing.createdAt) / (1000 * 60 * 60)),
          message: isProcessing ? "找到正在处理的导出任务" : "找到可供下载的导出任务"
        });
      }
      
      // 创建SSE流
      const stream = new ReadableStream({
        async start(controller) {
          await processExport(controller, taskId, token, teamId, includeMetadata, includeThumbnails, kv);
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
      
    } catch (error) {
      console.error("Export error:", error);
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }
};

async function checkExistingTask(token: string, teamId: string | undefined, kv: Deno.Kv): Promise<TaskMeta | null> {
  // Use last 10 chars of token for consistency
  const userTokenPart = token.slice(-10);
  
  // Look for a recent task with this identifier
  const entries = kv.list<TaskMeta>({ prefix: ['tasks'] });
  
  // Check all tasks for matching user and team
  for await (const entry of entries) {
    const task = entry.value;
    
    if (task.userToken === userTokenPart && 
        task.teamId === teamId &&
        task.status === 'ready') {
      
      const ageHours = (Date.now() - task.createdAt) / (1000 * 60 * 60);
      if (ageHours < 2) { // 2小时内的任务可复用
        // Check for task lock to avoid reusing active tasks
        const lockData = await kv.get(['task_lock', task.taskId]);
        if (lockData.value) {
          console.log(`[TASK] ⚠️ 任务 ${task.taskId} 正在被处理中，不可重用`);
          continue; // Skip this task and check the next one
        }
        
        return task;
      }
    }
  }
  
  return null;
}

async function processExport(
  controller: ReadableStreamDefaultController,
  taskId: string,
  token: string,
  teamId: string | undefined,
  includeMetadata: boolean,
  includeThumbnails: boolean,
  kv: Deno.Kv
) {
  type EventData = 
    | { type: "status"; message: string; }
    | { type: "progress"; message: string; progress: number; }
    | { type: "download_ready"; taskId: string; filename: string; downloadUrl: string; totalImages: number; thumbnailStats?: { total: number; available: number; } }
    | { type: "error"; error: string; };

  const send = (data: EventData) => {
    try {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (e) {
      console.error(`[${taskId}] SSE send error:`, e);
    }
  };
    try {
    send({ type: "status", message: "开始获取元数据..." });
    
    // 获取所有图片元数据
    const client = createChatGPTClient({ accessToken: token, teamId, bypassProxy: true });
    const allImages = await client.fetchAllImageMetadata({
      teamId,
      onProgress: (progress) => {
        send({
          type: "progress",
          message: `获取元数据中... 已找到${progress.totalImages}张图片`,
          progress: progress.progress
        });
        return Promise.resolve();
      }
    });
    
    if (allImages.length === 0) {
      throw new Error("未找到任何图片");
    }
      console.log(`[${taskId}] 📊 找到${allImages.length}张图片`);    send({ type: "status", message: `找到${allImages.length}张图片，准备导出中...` });
    
    // Debug: Log structure of the first image to understand thumbnail structure
    if (allImages.length > 0) {
      debugImageStructure(allImages[0]);
    }
    
    // Count available thumbnails
    let thumbnailCount = 0;
    let validThumbnailCount = 0;
    
    if (includeThumbnails) {
      console.log(`[${taskId}] 🔍 检查图片缩略图...`);
      for (const img of allImages) {
        const thumbnailUrl = extractThumbnailUrl(img);
        if (thumbnailUrl) {
          thumbnailCount++;
          // Validate thumbnail URL format
          if (thumbnailUrl.startsWith('http')) {
            validThumbnailCount++;
          }
        }
      }
      console.log(`[${taskId}] 📊 缩略图统计: ${validThumbnailCount}/${thumbnailCount} 个有效缩略图 (共 ${allImages.length} 张图片)`);
      send({ 
        type: "status", 
        message: `找到${allImages.length}张图片，其中${validThumbnailCount}张有缩略图，准备导出中...` 
      });
    }
    
    // Convert and store data with smaller chunks to reduce memory pressure
    const chunkSize = 25; // Reduced from 50 to 25 images per chunk
    const totalChunks = Math.ceil(allImages.length / chunkSize);
    
    const workspace = teamId && teamId !== "personal" ? teamId.substring(0, 10) : "personal";
    const timestamp = formatDateForFilename(Date.now() / 1000);
    const filename = `chatgpt_images_${workspace}_${timestamp}.zip`;
    
    // 创建任务元数据
    const taskMeta: TaskMeta = {
      taskId,
      userToken: token.slice(0, 10), // Store a portion of the token for identification
      teamId,
      includeMetadata,
      includeThumbnails,
      filename,
      totalImages: allImages.length,
      totalChunks,
      status: "preparing",
      createdAt: Date.now()
    };
    
    // 存储任务信息
    await kv.set(['tasks', taskId], taskMeta, { expireIn: 2 * 60 * 60 * 1000 });
        // Split the storage operations into two separate transactions
    // First, store all image chunks (smaller to reduce memory pressure)
    let imageOps = kv.atomic();
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, allImages.length);
      const chunkImages = allImages.slice(start, end);
      
      // Convert to simplified format
      const imageData: ImageData[] = chunkImages.map(img => ({
        id: img.id,
        url: img.url,
        thumbnailUrl: extractThumbnailUrl(img),
        title: img.title || "Untitled",
        created_at: img.created_at,
        width: img.width || 1024,
        height: img.height || 1024,
        metadata: undefined // Don't include metadata in image chunks
      }));
      
      // Store image chunk
      imageOps.set(['img_chunks', taskId, i], imageData, { expireIn: 2 * 60 * 60 * 1000 });
      
      // Add short delay between iterations to prevent memory pressure
      if (i > 0 && i % 5 === 0) {
        await imageOps.commit();
        // Create a new transaction for the next batch
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
          // @ts-ignore: Deno doesn't type gc() but it exists in some environments
          if (globalThis.gc) globalThis.gc();
        } catch (_e) {
          // Ignore errors from GC
        }
        imageOps = kv.atomic();
      }
    }
    await imageOps.commit();
    
    // Then, if needed, store metadata in a separate transaction
    if (includeMetadata) {
      let metaOps = kv.atomic();
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, allImages.length);
        const chunkImages = allImages.slice(start, end);
        
        // Convert with metadata included
        const metaData: ImageData[] = chunkImages.map(img => ({
          id: img.id,
          url: img.url,
          thumbnailUrl: extractThumbnailUrl(img),
          title: img.title || "Untitled",
          created_at: img.created_at,
          width: img.width || 1024,
          height: img.height || 1024,
          metadata: img.metadata
        }));
        
        // Store metadata chunk
        metaOps.set(['meta_chunks', taskId, i], metaData, { expireIn: 2 * 60 * 60 * 1000 });
        
        // Add short delay between iterations to prevent memory pressure
        if (i > 0 && i % 5 === 0) {
          await metaOps.commit();
          // Create a new transaction for the next batch
          await new Promise(resolve => setTimeout(resolve, 100));
          try {
            // @ts-ignore: Deno doesn't type gc() but it exists in some environments
            if (globalThis.gc) globalThis.gc();
          } catch (_e) {
            // Ignore errors from GC
          }
          metaOps = kv.atomic();
        }
      }
      
      // Store metadata info in the last transaction
      metaOps.set(['meta_info', taskId], { totalChunks, totalImages: allImages.length }, { expireIn: 2 * 60 * 60 * 1000 });
      await metaOps.commit();    }
    if (includeMetadata) {
      // Meta info is already set in the metadata transaction above
    }
    
    // Clean up memory// 清理内存中的大数组
    // @ts-ignore: Clearing array to help with garbage collection
    allImages.length = 0;
    
    // 强制GC
    try {
      // @ts-ignore: Deno doesn't type gc() but it exists in some environments
      if (globalThis.gc) globalThis.gc();
    } catch (_e) {
      // Ignore errors from GC
    }
    
    // 更新任务状态
    taskMeta.status = "ready";    await kv.set(['tasks', taskId], taskMeta, { expireIn: 2 * 60 * 60 * 1000 });
    
    console.log(`[${taskId}] ✅ 导出准备就绪`);
      // 发送完成事件
    send({
      type: "download_ready",
      taskId,
      filename,
      downloadUrl: `/api/export/${taskId}`,
      totalImages: allImages.length,
      thumbnailStats: includeThumbnails ? { 
        total: thumbnailCount, 
        available: validThumbnailCount 
      } : undefined
    });
      } catch (error) {
    console.error(`[${taskId}] 导出错误:`, error);
    send({ 
      type: "error", 
      error: error instanceof Error ? error.message : String(error) 
    });
  } finally {
    try {
      controller.close();
    } catch (e) {
      console.error(`[${taskId}] 控制器关闭错误:`, e);
    }
  }
}

/**
 * 检查任务是否正在处理中
 */
async function isTaskBeingProcessed(taskId: string, kv: Deno.Kv): Promise<boolean> {
  const lockKey = ['task_lock', taskId];
  const lock = await kv.get(lockKey);
  
  if (lock.value) {
    interface LockData {
      startTime: number;
      pid: string;
    }
    
    const lockData = lock.value as LockData;
    const lockAge = Date.now() - (lockData.startTime || 0);
    // 如果锁的年龄小于5分钟，认为任务正在处理中
    return lockAge < 5 * 60 * 1000;
  }
  
  return false;
}

// Fix TypeScript error by using Record for unknown properties
interface ImageWithEncodings extends ImageItem {
  encodings?: {
    thumbnail?: { path?: string };
  };
  thumbnail?: { path?: string };
  metadata?: {
    encodings?: {
      thumbnail?: { path?: string };
    };
  };
}

// Helper function for debugging image metadata structure
function debugImageStructure(img: ImageWithEncodings): void {
  // Only log the most essential information to reduce verbosity
  const extractedThumbnail = extractThumbnailUrl(img);
  console.log(`Image ID: ${img.id}`);
  
  // Only include detailed logging when running in debug mode or when no thumbnail is found
  if (!extractedThumbnail) {
    console.log(`No thumbnail found for image ${img.id}`);
    
    // Log a very brief structure to understand what's available
    const structure = {
      hasEncodings: !!img.encodings,
      hasMetadata: !!img.metadata,
      hasThumbnailField: !!img.thumbnail,
      hasEncodingsThumbnail: !!img.encodings?.thumbnail,
      hasMetadataEncodings: !!img.metadata?.encodings
    };
    
    console.log("Image structure:", structure);
  }
}

function extractThumbnailUrl(img: ImageWithEncodings): string | undefined {
  // Common paths based on examining the metadata structure
  const paths = [
    img.encodings?.thumbnail?.path,
    img.metadata?.encodings?.thumbnail?.path,
    img.thumbnail?.path,
    // Check if there's a direct thumbnail property
    typeof img.thumbnail === 'string' ? img.thumbnail : undefined
  ];
  
  // First check the known paths
  for (const path of paths) {
    if (typeof path === 'string' && path.startsWith('http')) {
      return path;
    }
  }
  
  // Check if the image URL itself contains a thumbnail version
  if (img.url && img.url.includes('thumbnail')) {
    return img.url;
  }
  
  // Deeper search for thumbnails - check the typical ChatGPT structure
  try {
    // Try deeper structure search if metadata is available
    if (img.metadata) {
      // Convert to string for easier searching
      const metadataStr = JSON.stringify(img.metadata);
      
      // Various patterns to look for thumbnail URLs
      const patterns = [
        /"thumbnail".*?path"?\s*:\s*"(https?:\/\/[^"]+)"/,
        /"(https?:\/\/[^"]+\/thumbnail[^"]*?)"/,
        /"(https?:\/\/[^"]+_thumb\.[^"]+)"/,
        /"(https?:\/\/[^"]+\/thumbnails?\/[^"]+)"/,
        /"originalPath"?\s*:\s*"(https?:\/\/[^"]+)"/
      ];
      
      for (const pattern of patterns) {
        const match = metadataStr.match(pattern);
        if (match && match[1] && match[1].startsWith('http')) {
          return match[1];
        }
      }
    }
    
    // Also check the encodings object directly if available
    if (img.encodings) {
      const encodingsStr = JSON.stringify(img.encodings);
      const originalPathMatch = encodingsStr.match(/"originalPath"?\s*:\s*"(https?:\/\/[^"]+)"/);
      if (originalPathMatch && originalPathMatch[1]) {
        return originalPathMatch[1];
      }
    }
    
    // Last resort - search the entire object
    const fullImgStr = JSON.stringify(img);
    
    // Try multiple patterns
    const patterns = [
      /https?:\/\/[^"]+thumbnail[^"]+/,
      /https?:\/\/[^"]+\/thumbnails?\/[^"]+/,
      /https?:\/\/[^"]+_thumb\.[^"]+/,
      /"originalPath"?\s*:\s*"(https?:\/\/[^"]+)"/
    ];
    
    for (const pattern of patterns) {
      const match = fullImgStr.match(pattern);
      if (match) {
        // Get the matched URL
        const url = match[1] || match[0];
        // Verify it's a proper URL
        if (typeof url === 'string' && url.startsWith('http')) {
          return url;
        }
      }
    }
  } catch (_e) {
    // Silently ignore errors in thumbnail extraction
  }
  
  return undefined;
}