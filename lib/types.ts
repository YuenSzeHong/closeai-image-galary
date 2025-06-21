// lib/types.ts - Central type definitions for ChatGPT Image Export project

/**
 * =================================================================
 * 共享类型定义
 * =================================================================
 */

// --- 基础图片数据类型 ---

/** ChatGPT API 返回的核心图片项目结构。 */
export interface ImageItem {
    id: string;
    url: string;
    title: string;
    created_at: number; // Unix timestamp in seconds
    width: number;
    height: number;
    metadata?: Record<string, unknown>;
  }
  
  /** ChatGPT API 原始返回的图片项（可能缺少某些字段）。 */
  export interface RawImageItem {
    id: string;
    url: string;
    title?: string;
    created_at: number; // Unix timestamp in seconds
    width?: number;
    height?: number;
    [key: string]: unknown;
  }
  
  /** ChatGPT API 返回的图片批次响应。 */
  export interface ImageBatchResponse {
    items: RawImageItem[];
    cursor?: string;
    total_count?: number;
  }
  
  // --- 前端 UI 展示和数据处理相关的图片类型 ---
  
  /** 增强的图片项目，用于前端 UI 展示。 */
  export interface GalleryImageItem extends ImageItem {
    originalUrl?: string;
    encodings?: {
      thumbnail?: {
        path: string;
        originalPath?: string;
        blobUrl?: string;
      };
    };
  }
  
  /** 前端图库组件的响应数据结构。 */
  export interface GalleryResponse {
    items: GalleryImageItem[];
    cursor?: string;
  }
  
  // --- 数据库持久化相关的图片和团队类型 ---
  
  /** 图片元数据，用于数据库存储。 */
  export interface ImageMetadata extends ImageItem {
    urlExpiry?: Date;
    conversation_id?: string;
    message_id?: string;
    tags: string[];
    isUrlValid: boolean;
    lastUpdated: number;
  }
  
  /** 团队/账户信息。 */
  export interface TeamAccount {
    id: string;
    display_name: string;
    is_deactivated: boolean;
  }
  
  /** 团队信息，用于数据库存储。 */
  export interface TeamInfo {
    id: string;
    name: string;
    lastSync: number;
    imageCount: number;
    lastMetadataSync: number;
    metadataFetched: boolean;
  }
  
  // --- SSE（Server-Sent Events）相关类型 ---
  
  /** 核心状态更新事件载荷 (SSE `type: "status"`)。 */
  export interface SseStatusPayload {
    type: "status";
    id: string;
    status: "preparing" | "processing" | "download_ready" | "failed";
    stages: {
      metadata: {
        status: "pending" | "running" | "completed" | "failed";
        progress: number;
        currentBatch?: number;
        totalImages?: number;
      };
    };
    progress: number;
    totalImages: number;
    error?: string;
    downloadUrl?: string;
    filename?: string;
    createdAt: number;
    updatedAt: number;
  }
  
  /** 元数据抓取进度事件载荷 (SSE `type: "metadata_progress"`)。 */
  export interface SseMetadataProgressPayload {
    type: "metadata_progress";
    taskId: string;
    progress: number;
    currentBatch?: number;
    totalImages?: number;
    message?: string;
  }
  
  /** 下载就绪通知事件载荷 (SSE `type: "download_ready"`)。 */
  export interface SseDownloadReadyPayload {
    type: "download_ready";
    taskId: string;
    filename: string;
    downloadUrl: string;
    totalImages: number;
  }
  
  /** 错误通知事件载荷 (SSE `type: "error"`)。 */
  export interface SseErrorPayload {
    type: "error";
    error: string;
    taskId?: string;
  }
  
  /** 所有可能的 SSE 事件类型的联合。 */
  export type SseEvent =
    | SseStatusPayload
    | SseMetadataProgressPayload
    | SseDownloadReadyPayload
    | SseErrorPayload;
  
  /** Deno KV 中存储的导出任务状态的类型。 */
  export type ExportTaskSseStatusKVSnapshot = SseStatusPayload;
  
  // --- 后端 ZIP 流式下载任务管理相关类型 ---
  
  /** 用于描述后端 ZIP 流式导出任务的元数据。 */
  export interface ExportStreamTaskMetadata {
    taskId: string;
    teamId?: string;
    includeMetadata: boolean;
    includeThumbnails: boolean;
    status: "pending" | "ready_for_download" | "failed";
    createdAt: number;
    filename: string;
    totalImageChunks: number;
    totalImagesCount: number;
  }
  
  /** 现有任务检查的 API 响应。 */
  export interface ExistingTaskResponse {
    type: "existing_task_found";
    taskId: string;
    filename: string;
    downloadUrl: string;
    totalImages: number;
    createdAt: number;
    ageHours: number;
    message: string;
  }
  
  // --- 前端 UI 状态相关类型 ---
  
  /** 定义前端组件的内部状态机流转。 */
  export type ClientExportState =
    | "idle"
    | "checking_existing"
    | "existing_found"
    | "preparing_metadata"
    | "metadata_ready"
    | "downloading"
    | "export_complete"
    | "failed";
  
  /** 用于驱动前端 UI 实时显示任务详细信息的数据结构。 */
  export interface ClientTaskDisplay {
    id?: string;
    metadataStatus?: "pending" | "running" | "completed" | "failed";
    metadataProgress?: number;
    metadataCurrentBatch?: number;
    metadataTotalImages?: number;
    overallProgress?: number;
    totalImagesFinal?: number;
    error?: string;
    downloadUrl?: string;
    filename?: string;
    ageHours?: number;
    isExistingTask?: boolean;
  }