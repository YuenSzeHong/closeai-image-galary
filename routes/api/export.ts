// routes/api/export.ts

/// <reference lib="deno.unstable" />
import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import {
  createChatGPTClient,
  type ImageItem,
} from "../../lib/chatgpt-client.ts";
import {
  type ExportStreamTaskMetadata,
  type ExportTaskSseStatusKVSnapshot,
  type SseEvent,
  type SseMetadataProgressPayload,
} from "../../lib/types.ts";
import {
  getKv,
  KV_EXPIRY_SSE_STATUS,
  KV_EXPIRY_STREAM_DATA,
  MAX_IMAGES_PER_KV_CHUNK,
} from "../../utils/kv.ts";
import { formatDateForFilename } from "../../utils/fileUtils.ts";

const ExportRequestSchema = z.object({
  token: z.string().min(10, "Access token must be at least 10 characters long."),
  teamId: z.string().optional(),
  includeMetadata: z.boolean().default(true),
  includeThumbnails: z.boolean().default(false),
});

/**
 * Fresh Handlers for the `/api/export` route.
 * Handles GET (task status), POST (initiate export), and DELETE (cleanup expired tasks) requests.
 */
export const handler: Handlers<
  ExportTaskSseStatusKVSnapshot | null,
  Record<PropertyKey, never>
> = {
  /** Handles GET requests to retrieve the status of a specific export task. */
  async GET(req, _ctx) {
    const kv = await getKv();
    const url = new URL(req.url);
    const taskId = url.searchParams.get("taskId");

    if (!taskId) {
      return Response.json({ error: "Missing taskId parameter" }, {
        status: 400,
      });
    }

    const taskResult = await kv.get<ExportTaskSseStatusKVSnapshot>([
      "export_tasks_sse",
      taskId,
    ]);
    if (!taskResult.value) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }
    return Response.json(taskResult.value);
  },

  /** Handles POST requests to initiate a new export task or check for existing ones. */
  async POST(req, _ctx) {
    try {
      const kv = await getKv();
      const body = await req.json();
      const validation = ExportRequestSchema.safeParse(body);
      if (!validation.success) {
        return Response.json(
          {
            error: "Invalid request body",
            details: validation.error.format(),
          },
          { status: 400 },
        );
      }
      const { token, teamId, includeMetadata, includeThumbnails } =
        validation.data;
      const taskId = crypto.randomUUID();

      const initialSseTask: ExportTaskSseStatusKVSnapshot = {
        type: "status",
        id: taskId,
        status: "preparing",
        stages: { metadata: { status: "pending", progress: 0 } },
        progress: 0,
        totalImages: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await kv.set(["export_tasks_sse", taskId], initialSseTask, {
        expireIn: KV_EXPIRY_SSE_STATUS,
      });

      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (event: SseEvent) => {
            if (
              controller.desiredSize === null || controller.desiredSize > 0
            ) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
              );
            } else {
              console.warn(
                `[${taskId}] SSE controller backpressure, event skipped for now.`,
              );
            }
          };

          const sendStatusUpdate = async (
            updates: Partial<Omit<ExportTaskSseStatusKVSnapshot, "type" | "id">>,
          ) => {
            try {
              const currentResult = await kv.get<ExportTaskSseStatusKVSnapshot>(
                ["export_tasks_sse", taskId],
              );
              if (currentResult.value) {
                const updatedTask: ExportTaskSseStatusKVSnapshot = {
                  ...currentResult.value,
                  ...updates,
                  updatedAt: Date.now(),
                };
                await kv.set(["export_tasks_sse", taskId], updatedTask, {
                  expireIn: KV_EXPIRY_SSE_STATUS,
                });
                sendEvent(updatedTask);
              }
            } catch (kvError) {
              console.error(
                `[${taskId}] KV error during sendStatusUpdate:`,
                kvError,
              );
              sendEvent({
                type: "error",
                error: "KV operation failed during status update",
                taskId: taskId,
              });
              try {
                controller.close();
              } catch (_e) { /* ignore */ }
            }
          };

          sendEvent(initialSseTask);

          try {
            await sendStatusUpdate({
              status: "processing",
              stages: { metadata: { status: "running", progress: 0 } },
            });

            const allImages = await fetchAllImageMetadata(
              token,
              teamId,
              async (metadataUpdate) => {
                sendEvent({
                  type: "metadata_progress",
                  taskId: taskId,
                  progress: metadataUpdate.progress,
                  currentBatch: metadataUpdate.currentBatch,
                  totalImages: metadataUpdate.totalImages,
                  message:
                    `正在获取图片列表 (批次 ${metadataUpdate.currentBatch || 0})`,
                } as SseMetadataProgressPayload);

                await sendStatusUpdate({
                  stages: { metadata: metadataUpdate },
                  totalImages: metadataUpdate.totalImages || 0,
                  progress: metadataUpdate.progress,
                });
              },
            );

            if (allImages.length === 0) {
              throw new Error("No images found to export.");
            }

            await sendStatusUpdate({
              stages: {
                metadata: {
                  status: "completed",
                  progress: 100,
                },
              },
              totalImages: allImages.length,
              progress: 100,
            });

            const workspaceName = teamId && teamId !== "personal"
              ? teamId.substring(0, 10)
              : "personal";
            const timestamp = formatDateForFilename(Date.now() / 1000);
            const downloadFilename =
              `chatgpt_images_${workspaceName}_${timestamp}.zip`;
            const downloadUrl = `/api/export/${taskId}`;

            const numChunks = Math.ceil(
              allImages.length / MAX_IMAGES_PER_KV_CHUNK,
            );
            const streamTaskMeta: ExportStreamTaskMetadata = {
              taskId,
              teamId,
              includeMetadata,
              includeThumbnails,
              status: "ready_for_download",
              createdAt: Date.now(),
              filename: downloadFilename,
              totalImageChunks: numChunks,
              totalImagesCount: allImages.length,
            };

            const atomicOp = kv.atomic();
            atomicOp.set(["export_stream_meta", taskId], streamTaskMeta, {
              expireIn: KV_EXPIRY_STREAM_DATA,
            });

            for (let i = 0; i < numChunks; i++) {
              const chunk = allImages.slice(
                i * MAX_IMAGES_PER_KV_CHUNK,
                (i + 1) * MAX_IMAGES_PER_KV_CHUNK,
              );
              atomicOp.set(
                ["export_stream_images", taskId, `chunk_${i}`],
                chunk,
                { expireIn: KV_EXPIRY_STREAM_DATA },
              );
            }
            const commitResult = await atomicOp.commit();
            if (!commitResult.ok) {
              console.error(
                `[${taskId}] Atomic commit failed for image chunks.`,
              );
              throw new Error("Failed to commit image chunks to KV.");
            }
            console.log(
              `[${taskId}] Stored ${numChunks} image chunks and metadata in KV.`,
            );

            await sendStatusUpdate({
              status: "download_ready",
              downloadUrl: downloadUrl,
              filename: downloadFilename,
            });

            sendEvent({
              type: "download_ready",
              taskId: taskId,
              filename: downloadFilename,
              downloadUrl: downloadUrl,
              totalImages: allImages.length,
            });
          } catch (error) {
            const errorMessage = error instanceof Error
              ? error.message
              : String(error);
            console.error(`[${taskId}] SSE Processing Error:`, error);
            await sendStatusUpdate({
              status: "failed",
              error: errorMessage,
            });
            sendEvent({ type: "error", error: errorMessage, taskId: taskId });
            try {
              controller.close();
            } catch (_e) { /* ignore */ }
          }
        },
        cancel(reason) {
          console.log(
            `[SSE ${taskId}] Stream cancelled by client. Reason:`,
            reason,
          );
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Failed to start export:", error);
      return Response.json(
        {
          error: (error as Error).message || "Failed to start export",
        },
        { status: 500 },
      );
    }
  },

  /** Handles DELETE requests to clean up expired export tasks from Deno KV. */
  async DELETE(_req, _ctx) {
    try {
      const kv = await getKv();
      let cleanedKeysCount = 0;
      const cutoffTimeSse = Date.now() - 24 * 60 * 60 * 1000;
      const cutoffTimeStream = Date.now() - 2 * 60 * 60 * 1000;
      const keysToDelete: Deno.KvKey[] = [];

      const sseIter = kv.list<ExportTaskSseStatusKVSnapshot>({
        prefix: ["export_tasks_sse"],
      });
      for await (const entry of sseIter) {
        if (entry.value.createdAt < cutoffTimeSse) keysToDelete.push(entry.key);
      }

      const streamMetaIter = kv.list<ExportStreamTaskMetadata>({
        prefix: ["export_stream_meta"],
      });
      for await (const entry of streamMetaIter) {
        if (entry.value.createdAt < cutoffTimeStream) {
          keysToDelete.push(entry.key);
          const taskId = entry.key[1] as string;
          for (let i = 0; i < entry.value.totalImageChunks; i++) {
            keysToDelete.push(["export_stream_images", taskId, `chunk_${i}`]);
          }
        }
      }

      if (keysToDelete.length > 0) {
        const atomicOp = kv.atomic();
        keysToDelete.forEach((key) => atomicOp.delete(key));
        await atomicOp.commit();
        cleanedKeysCount = keysToDelete.length;
        console.log(`[KV Cleanup] Cleaned ${cleanedKeysCount} KV entries.`);
      } else {
        console.log(`[KV Cleanup] No expired KV entries found to clean.`);
      }
      return Response.json({
        message: `Cleaned ${cleanedKeysCount} KV entries for expired tasks.`,
      });
    } catch (error) {
      console.error("Failed to clean tasks:", error);
      return Response.json(
        {
          error: "Failed to clean tasks: " +
            (error instanceof Error ? error.message : String(error)),
        },
        { status: 500 },
      );
    }
  },
};

/** Fetches all image metadata from the ChatGPT API. */
async function fetchAllImageMetadata(
  accessToken: string,
  teamId: string | undefined,
  updateStage: (
    update: {
      status: "pending" | "running" | "completed" | "failed";
      progress: number;
      currentBatch?: number;
      totalImages?: number;
    },
  ) => Promise<void>,
): Promise<ImageItem[]> {  const client = createChatGPTClient({ 
    accessToken, 
    teamId,
    useProxy: false // Use direct API calls for backend operations
  });

  console.log(`[Meta] Starting metadata fetch for teamId: ${teamId || "personal"}`);

  await updateStage({
    status: "running",
    progress: 0,
    currentBatch: 0,
    totalImages: 0,
  });

  try {
    const allImages = await client.fetchAllImageMetadata({
      teamId,
      maxBatches: 200,
      maxConsecutiveEmpty: 3,
      onProgress: async (progress) => {
        await updateStage({
          status: "running",
          progress: progress.progress,
          currentBatch: progress.currentBatch,
          totalImages: progress.totalImages,
        });
      },
    });

    await updateStage({
      status: "completed",
      progress: 100,
      totalImages: allImages.length,
      currentBatch: Math.ceil(allImages.length / 50),
    });

    console.log(`[Meta] Fetched ${allImages.length} image metadata items.`);
    return allImages;
  } catch (error) {
    console.error(`[Meta] Error fetching metadata:`, error);
    throw error;
  }
}