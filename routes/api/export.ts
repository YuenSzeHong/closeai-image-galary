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
  includeThumbnails: z.boolean().default(false),
});

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
  async POST(req, _ctx) {
    try {
      const body = await req.json();
      const { token, teamId, includeMetadata, includeThumbnails } = ExportRequest.parse(body);
      
      const taskId = crypto.randomUUID();
      const kv = await getKv();
      
      console.log(`[${taskId}] 🚀 Starting export task`);
      
      // 检查现有任务
      const existing = await checkExistingTask(token, teamId, kv);
      if (existing) {
        console.log(`[${taskId}] 🎯 Found existing task: ${existing.taskId}`);
        return Response.json({
          type: "existing_task_found",
          taskId: existing.taskId,
          filename: existing.filename,
          downloadUrl: `/api/export/${existing.taskId}`,
          totalImages: existing.totalImages,
          ageHours: Math.round((Date.now() - existing.createdAt) / (1000 * 60 * 60)),
          message: "Found existing export ready for download"
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
      return Response.json({ error: error.message }, { status: 500 });
    }
  }
};

async function checkExistingTask(token: string, teamId: string | undefined, kv: Deno.Kv): Promise<TaskMeta | null> {
  // 简单的重复任务检查 - 基于token和teamId的hash
  const key = `${token.slice(-10)}_${teamId || 'personal'}`;
  const recent = await kv.get<TaskMeta>(['recent_tasks', key]);
  
  if (recent.value && recent.value.status === 'ready') {
    const ageHours = (Date.now() - recent.value.createdAt) / (1000 * 60 * 60);
    if (ageHours < 2) { // 2小时内的任务可复用
      return recent.value;
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
  const send = (data: any) => {
    try {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (e) {
      console.error(`[${taskId}] SSE send error:`, e);
    }
  };
  
  try {
    send({ type: "status", message: "Starting metadata fetch..." });
    
    // 获取所有图片元数据
    const client = createChatGPTClient({ accessToken: token, teamId, bypassProxy: true });
    const allImages = await client.fetchAllImageMetadata({
      teamId,
      onProgress: (progress) => {
        send({
          type: "progress",
          message: `Fetching metadata... ${progress.totalImages} images found`,
          progress: progress.progress
        });
        return Promise.resolve();
      }
    });
    
    if (allImages.length === 0) {
      throw new Error("No images found");
    }
      console.log(`[${taskId}] 📊 Found ${allImages.length} images`);
    send({ type: "status", message: `Found ${allImages.length} images, preparing export...` });
    
    // Convert and store data with smaller chunks to reduce memory pressure
    const chunkSize = 25; // Reduced from 50 to 25 images per chunk
    const totalChunks = Math.ceil(allImages.length / chunkSize);
    
    const workspace = teamId && teamId !== "personal" ? teamId.substring(0, 10) : "personal";
    const timestamp = formatDateForFilename(Date.now() / 1000);
    const filename = `chatgpt_images_${workspace}_${timestamp}.zip`;
    
    // 创建任务元数据
    const taskMeta: TaskMeta = {
      taskId,
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
    taskMeta.status = "ready";
    await kv.set(['tasks', taskId], taskMeta, { expireIn: 2 * 60 * 60 * 1000 });
    
    // 缓存为最近任务
    const key = `${token.slice(-10)}_${teamId || 'personal'}`;
    await kv.set(['recent_tasks', key], taskMeta, { expireIn: 2 * 60 * 60 * 1000 });
    
    console.log(`[${taskId}] ✅ Export ready`);
    
    // 发送完成事件
    send({
      type: "download_ready",
      taskId,
      filename,
      downloadUrl: `/api/export/${taskId}`,
      totalImages: allImages.length
    });
      } catch (error) {
    console.error(`[${taskId}] Export error:`, error);
    send({ 
      type: "error", 
      error: error instanceof Error ? error.message : String(error) 
    });
  } finally {
    try {
      controller.close();
    } catch (e) {
      console.error(`[${taskId}] Controller close error:`, e);
    }
  }
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

function extractThumbnailUrl(img: ImageWithEncodings): string | undefined {
  const paths = [
    img.encodings?.thumbnail?.path,
    img.metadata?.encodings?.thumbnail?.path,
    img.thumbnail?.path
  ];
  
  for (const path of paths) {
    if (typeof path === 'string' && path.startsWith('http')) {
      return path;
    }
  }
  
  return undefined;
}