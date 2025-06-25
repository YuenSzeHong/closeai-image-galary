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

interface TaskLock {
  startTime: number;
  clientId: string;
}

interface ActiveConnection {
  connectionId: string;
  startTime: number;
  userAgent?: string;
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
    const acceptEncoding = req.headers.get('accept-encoding') || '';
    const hasSecFetch = req.headers.has('sec-fetch-dest');
    const isDownloadManager = acceptEncoding.includes('identity') && !hasSecFetch;
    
    console.log(`[${taskId}] 📥 开始下载 (连接ID: ${connectionId.slice(-8)}) ${isDownloadManager ? '[IDM]' : '[浏览器]'}`);

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

      // 清理可能存在的僵尸锁（重启后的锁都是无效的）
      await cleanupZombieLocks(taskId, kv);
      
      // 清理旧的中止标志，开始新的下载任务
      await kv.delete(["task_aborted", taskId]);

      // 创建流式响应
      const headers = new Headers({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${task.filename}"`,
        "Cache-Control": "no-store, must-revalidate",
        "Accept-Ranges": "none",
        "X-Content-Type-Options": "nosniff",
        "Transfer-Encoding": "chunked", // 对于流式下载，使用 chunked
      });

      // 后来的请求接管：检查是否有现有连接，如果有就接管
      const shouldTakeover = await handleRequestTakeover(kv, taskId, connectionId, isDownloadManager);
      
      // 注册活跃连接
      await registerConnection(kv, taskId, connectionId, req.headers.get('user-agent'), isDownloadManager);
      
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              // 关键：这里不再添加2秒延迟，因为原版没有，且这可能是导致流提前关闭的原因之一
              await processTaskSafely(controller, taskId, task, kv, connectionId);
            } catch (error) {
              console.error(`[${taskId}] 流处理错误:`, error);

              // 确保清理锁
              await kv.delete(["task_lock", taskId]).catch(() => {});

              // Check if the stream is still writable before trying to send an error
              try {
                // Ensure we can still write to the controller
                if (
                  controller.desiredSize !== null && controller.desiredSize >= 0
                ) {
                  // If the error is about concurrent processing, send a special response
                  const errorMessage = error instanceof Error
                    ? error.message
                    : String(error);
                  if (
                    errorMessage.includes("任务正在被另一个请求处理中")
                  ) {
                    try {
                      const message = "下载处理中，请稍等一会再点击下载按钮...";
                      controller.enqueue(new TextEncoder().encode(message));
                      controller.close();
                    } catch (controllerError) {
                      console.log(`[${taskId}] 控制器已关闭，无法发送重试消息`);
                    }
                  } else {
                    try {
                      controller.error(error);
                    } catch (controllerError) {
                      console.log(`[${taskId}] 控制器已关闭，无法发送错误`);
                    }
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
              `[${taskId}] 🚫 客户端已断开连接 (${connectionId.slice(-8)}): ${reason || "未知原因"}`,
            );

            // 注销连接并检查是否还有其他活跃连接
            const shouldAbort = await unregisterConnection(kv, taskId, connectionId);
            
            if (shouldAbort) {
              console.log(`[${taskId}] 所有连接已断开，中止任务`);
              
              // 清理资源并在客户端断开连接时释放锁
              kv.delete(["task_lock", taskId]).catch((e) => {
                console.error(
                  `[${taskId}] 断开连接时释放锁失败:`,
                  e,
                );
              });

              // Store abort event in KV for tracking
              kv.set(["task_aborted", taskId], {
                timestamp: Date.now(),
                reason: String(reason || "All clients disconnected"),
              }, { expireIn: 24 * 60 * 60 * 1000 }).catch(() => {});
            } else {
              console.log(`[${taskId}] 还有其他连接活跃，继续处理`);
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
 * 处理请求接管逻辑
 */
async function handleRequestTakeover(kv: Deno.Kv, taskId: string, newConnectionId: string, isDownloadManager: boolean): Promise<boolean> {
  try {
    // 检查现有的活跃连接
    const connections = kv.list<ActiveConnection>({ prefix: ["active_connections", taskId] });
    const existingConnections = [];
    
    for await (const connection of connections) {
      existingConnections.push(connection);
    }
    
    if (existingConnections.length > 0) {
      console.log(`[${taskId}] 🔄 检测到 ${existingConnections.length} 个现有连接，新请求将接管`);
      
      // 标记所有现有连接应该被接管
      for (const connection of existingConnections) {
        await kv.set(["connection_takeover", taskId, connection.value.connectionId], {
          takenOverBy: newConnectionId,
          timestamp: Date.now(),
        }, { expireIn: 60 * 1000 }); // 1分钟过期
        
        console.log(`[${taskId}] 🔄 标记连接 ${connection.value.connectionId.slice(-8)} 被接管`);
      }
      
      // 设置接管标志，让旧的请求知道被接管了
      await kv.set(["task_takeover", taskId], {
        newConnectionId,
        timestamp: Date.now(),
        isDownloadManager,
      }, { expireIn: 60 * 1000 });
      
      return true; // 表示发生了接管
    }
    
    return false; // 没有现有连接，不需要接管
  } catch (error) {
    console.warn(`[${taskId}] 处理请求接管失败:`, error);
    return false;
  }
}

/**
 * 注册活跃连接
 */
async function registerConnection(kv: Deno.Kv, taskId: string, connectionId: string, userAgent?: string | null, isDownloadManager?: boolean): Promise<void> {
  try {
    const connection: ActiveConnection = {
      connectionId,
      startTime: Date.now(),
      userAgent: userAgent || undefined,
    };
    
    await kv.set(["active_connections", taskId, connectionId], connection, { expireIn: 60 * 60 * 1000 }); // 1小时过期
    console.log(`[${taskId}] 注册连接 ${connectionId.slice(-8)} ${isDownloadManager ? '[IDM]' : '[浏览器]'}`);
  } catch (error) {
    console.warn(`[${taskId}] 注册连接失败:`, error);
  }
}

/**
 * 注销连接并返回是否应该中止任务
 */
async function unregisterConnection(kv: Deno.Kv, taskId: string, connectionId: string): Promise<boolean> {
  try {
    // 删除当前连接
    await kv.delete(["active_connections", taskId, connectionId]);
    console.log(`[${taskId}] 注销连接 ${connectionId.slice(-8)}`);
    
    // 检查是否还有其他活跃连接
    const connections = kv.list<ActiveConnection>({ prefix: ["active_connections", taskId] });
    const activeConnections = [];
    
    for await (const connection of connections) {
      activeConnections.push(connection);
    }
    
    console.log(`[${taskId}] 剩余活跃连接: ${activeConnections.length}`);
    return activeConnections.length === 0; // 如果没有活跃连接，返回true表示应该中止
  } catch (error) {
    console.warn(`[${taskId}] 注销连接失败:`, error);
    return true; // 出错时保守地中止任务
  }
}

/**
 * 清理僵尸锁
 */
async function cleanupZombieLocks(taskId: string, kv: Deno.Kv): Promise<void> {
  try {
    const lockKey = ["task_lock", taskId];
    const existingLock = await kv.get(lockKey);

    if (existingLock.value) {
      const lockAge = Date.now() -
        ((existingLock.value as TaskLock).startTime || 0);
      // 超过2分钟的锁认为是僵尸锁
      if (lockAge > 2 * 60 * 1000) {
        console.log(
          `[${taskId}] 🧹 清理僵尸锁 (${Math.round(lockAge / 1000)}秒前)`,
        );
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
  kv: Deno.Kv,
  connectionId: string,
) {
  let lockAcquired = false;
  // 恢复原版clientState的逻辑，它会根据超时判断并标记disconnected
  const clientState = { disconnected: false, lastActivity: Date.now() };

  // Set up a mechanism to check if the client is still connected (恢复原版逻辑)
  const setupAbortChecker = () => {
    const checkConnection = async () => {
      try {
        // Check for aborted task flag in KV
        const aborted = await kv.get(["task_aborted", taskId]);
        if (aborted.value) {
          console.log(
            `[${taskId}] 🛑 任务之前已中止，停止处理 (由KV标志检测)`,
          );
          clientState.disconnected = true;
          return;
        }

        // Check if this connection has been taken over
        const takeover = await kv.get(["connection_takeover", taskId, connectionId]);
        if (takeover.value) {
          console.log(
            `[${taskId}] 🔄 连接 ${connectionId.slice(-8)} 被接管，停止处理`,
          );
          clientState.disconnected = true;
          return;
        }

        // Check if we can still write to the controller
        if (!controller.desiredSize || controller.desiredSize < 0) {
          console.log(
            `[${taskId}] 🚫 客户端似乎已断开连接（控制器已关闭）`,
          );
          clientState.disconnected = true;
          return; // 如果控制器已关闭，不再安排下一次检查
        }

        // Check if there are still active connections
        const connections = kv.list<ActiveConnection>({ prefix: ["active_connections", taskId] });
        const activeConnections = [];
        for await (const connection of connections) {
          activeConnections.push(connection);
        }
        
        if (activeConnections.length === 0) {
          console.log(
            `[${taskId}] 📵 没有活跃连接，标记为断开`,
          );
          clientState.disconnected = true;
          return;
        }

        // If too much time has passed since last successful write, consider connection dead
        const timeSinceActivity = Date.now() - clientState.lastActivity;
        if (timeSinceActivity > 15000) { // 15 seconds of inactivity
          console.log(
            `[${taskId}] ⏱️ 客户端 ${
              Math.round(timeSinceActivity / 1000)
            }秒无活动，标记为断开`,
          );
          clientState.disconnected = true;
          return; // 标记断开后，不再安排下一次检查
        }

        // Still connected, schedule next check
        if (!clientState.disconnected) {
          setTimeout(checkConnection, 3000); // Check every 3 seconds
        }
      } catch (_e) {
        setTimeout(checkConnection, 1000);
      }
    };
    setTimeout(checkConnection, 3000); // Start checking for disconnection
    return clientState; // Return the client state for the rest of the process to check
  };

  // Initialize client state tracker
  const _clientStateInstance = setupAbortChecker(); // 调用并启动检查器，并将返回的clientState实例赋值给一个新变量

  try {
    // 🔒 尝试获取任务锁，使用更短的超时
    const lockKey = ["task_lock", taskId];
    const lockData = { startTime: Date.now(), pid: crypto.randomUUID() };

    const lockResult = await kv.atomic()
      .check({ key: lockKey, versionstamp: null })
      .set(lockKey, lockData, { expireIn: 5 * 60 * 1000 }) // 5分钟锁
      .commit();
    if (!lockResult.ok) {
      // 检查锁的年龄，如果太老直接抢占
      const existingLock = await kv.get(lockKey);
      if (existingLock.value) {
        const lockAge = Date.now() -
          ((existingLock.value as TaskLock).startTime || 0);

        // 如果锁过期（2分钟），则强制释放
        if (lockAge > 2 * 60 * 1000) {
          console.warn(
            `[${taskId}] 抢占过期锁 (${Math.round(lockAge / 1000)}秒)`,
          );
          await kv.delete(lockKey);

          const retryResult = await kv.atomic()
            .check({ key: lockKey, versionstamp: null })
            .set(lockKey, lockData, { expireIn: 5 * 60 * 1000 })
            .commit();

          if (!retryResult.ok) {
            throw new Error("无法获取任务锁");
          }
          lockAcquired = true;
        } else {
          // 如果是最近的锁（10秒内），说明任务正在处理中，但我们已经接管了
          if (lockAge < 10 * 1000) {
            console.log(
              `[${taskId}] ⏳ 任务刚刚开始处理 (${
                Math.round(lockAge / 1000)
              }秒前)，继续处理（已接管前一个请求）`,
            );
            // 强制获取锁，因为我们接管了前一个请求
            await kv.delete(lockKey);
            const retryResult = await kv.atomic()
              .check({ key: lockKey, versionstamp: null })
              .set(lockKey, lockData, { expireIn: 5 * 60 * 1000 })
              .commit();
            if (retryResult.ok) {
              lockAcquired = true;
            } else {
              throw new Error("无法获取任务锁");
            }
          } else {
            throw new Error("任务正在被另一个请求处理中");
          }
        }
      } else {
        throw new Error("无法获取任务锁");
      }
    } else {
      lockAcquired = true;
    }

    console.log(`[${taskId}] 🔒 获取任务锁`);

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
          } catch (controllerError) {
            console.log(`[${taskId}] 控制器已关闭，无法发送ZIP错误`);
          }
        }
        return;
      }

      if (chunk && chunk.length > 0) {
        try {
          // Check for client disconnection before attempting to send data
          // 根据原版，这里的clientState.disconnected判断是有的，保留
          if (_clientStateInstance.disconnected) { // 使用实例变量
            console.log(
              `[${taskId}] 📵 客户端已断开连接，停止ZIP流发送`, // 日志修正
            );
            closed = true;
            return;
          }

          // Also check if the controller is still writable
          if (!controller.desiredSize || controller.desiredSize < 0) {
            console.log(
              `[${taskId}] ⚠️ 流不再可写，标记为已断开连接并停止发送`, // 日志修正
            );
            closed = true;
            _clientStateInstance.disconnected = true; // 即使这里，也标记一下，保持一致
            return;
          }

          // Only enqueue if we're sure the client is still connected
          try {
            controller.enqueue(chunk);
            // Update last activity timestamp when we successfully write to the stream
            _clientStateInstance.lastActivity = Date.now(); // 使用实例变量
          } catch (enqueueError) {
            console.log(`[${taskId}] ⚠️ 控制器已关闭，无法发送数据块`);
            closed = true;
            _clientStateInstance.disconnected = true;
            return;
          }
        } catch (e) {
          console.error(`[${taskId}] 控制器写入错误:`, e); // 日志修正
          closed = true;
          _clientStateInstance.disconnected = true;
        }
      }

      if (final && !closed) {
        try {
          // One final check before closing
          if (!_clientStateInstance.disconnected) { // 使用实例变量
            console.log(`[${taskId}] ✅ 完成`);
            controller.close();
          }
        } catch (e) {
          console.error(`[${taskId}] 关闭流错误:`, e); // 日志修正
        } finally {
          closed = true;
        }
      }
    }; // 先处理元数据
    if (task.includeMetadata) {
      console.log(`[${taskId}] 📄 添加metadata.json`);

      // Check if client has disconnected before processing metadata (原版逻辑)
      if (_clientStateInstance.disconnected) { // 使用实例变量
        console.log(
          `[${taskId}] 🛑 跳过元数据处理，客户端已断开连接`, // 日志修正
        );
      } else {
        await writeMetadataWithAbortCheck(
          zip,
          taskId,
          task,
          kv,
          _clientStateInstance,
        ); // 传递实例变量

        if (!_clientStateInstance.disconnected) { // 只有在连接未断开时才清理元数据
          console.log(`[${taskId}] 🧹 从KV中清除元数据`);
          await clearMetadata(taskId, task, kv);
        }
      }
    } // 然后处理图片
    console.log(`[${taskId}] 📸 处理图片中`);
    let successCount = 0;
    let errorCount = 0;

    // Modified to pass client state and check for disconnection (原版逻辑)
    await processImagesWithAbortCheck(
      zip,
      taskId,
      task,
      kv,
      _clientStateInstance, // 传递实例变量
      (success) => {
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
      },
    );

    if (_clientStateInstance.disconnected) { // 使用实例变量
      console.log(
        `[${taskId}] 🛑 图片处理中止，客户端已断开连接`, // 日志修正
      );
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
    // 🔒 释放任务锁
    if (lockAcquired) {
      try {
        await kv.delete(["task_lock", taskId]);
        console.log(`[${taskId}] 🔓 释放任务锁`);
      } catch (lockError) {
        console.error(`[${taskId}] 释放锁时发生错误:`, lockError); // 日志修正
      }
    }
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
  clientState: { disconnected: boolean; lastActivity: number },
) {
  // Check for client disconnection before starting (原版逻辑)
  if (clientState.disconnected) {
    console.log(`[${taskId}] 🛑 跳过元数据处理，客户端已断开连接`); // 日志修正
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
    // Check for disconnection before each chunk (原版逻辑)
    if (clientState.disconnected) {
      console.log(
        `[${taskId}] 🛑 元数据处理中止，客户端已断开连接`, // 日志修正
      );
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

      // Ensure we're still connected (原版逻辑)
      if (clientState.disconnected) {
        console.log(
          `[${taskId}] 🛑 元数据处理中止，客户端已断开连接`, // 日志修正
        );
        return;
      }

      // Add a small delay to prevent memory pressure
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Check for disconnection before writing file (原版逻辑)
  if (clientState.disconnected) {
    console.log(
      `[${taskId}] 🛑 元数据写入中止，客户端已断开连接`, // 日志修正
    );
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
  clientState: { disconnected: boolean; lastActivity: number },
  progressCallback?: (success: boolean) => void,
) {
  let processed = 0;
  const batchStart = Date.now();

  for (let i = 0; i < task.totalChunks; i++) {
    // Check if client has disconnected before processing each chunk (原版逻辑)
    if (clientState.disconnected) {
      console.log(
        `[${taskId}] 🛑 中止图片处理，客户端已断开连接`, // 日志修正
      );
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
      // Check for disconnection before each batch (原版逻辑)
      if (clientState.disconnected) {
        console.log(
          `[${taskId}] 🛑 中止图片批处理，客户端已断开连接`, // 日志修正
        );
        return;
      }

      const batchImages = imageArray.slice(j, j + batchSize);

      for (const img of batchImages) {
        try {
          // Check for disconnection before each image (原版逻辑)
          if (clientState.disconnected) {
            return;
          }

          // 处理主图
          await processImageWithRetry(img, zip, taskId, false);

          // 处理缩略图 - only process if includeThumbnails is true AND the thumbnailUrl exists
          if (
            task.includeThumbnails && img.thumbnailUrl &&
            img.thumbnailUrl !== img.url
          ) {
            // Check for disconnection before processing thumbnail (原版逻辑)
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
