// lib/types.ts - 简化的类型定义

// 基础图片数据类型
export interface ImageItem {
  id: string;
  url: string;
  title: string;
  created_at: number;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown; // Allow additional properties
}

export interface RawImageItem {
  id: string;
  url: string;
  title?: string;
  created_at: number;
  width?: number;
  height?: number;
  // Fields from the 2025 ChatGPT API raw response format
  tags?: string[];
  kind?: string;
  generation_id?: string;
  generation_type?: string;
  prompt?: string | null;
  output_blocked?: boolean;
  source?: string;
  encodings?: {
    source?: null | Record<string, unknown>;
    thumbnail?: null | {
      path?: string;
    };
    unfurl?: null | Record<string, unknown>;
    md?: null | Record<string, unknown>;
  };
  is_archived?: boolean;
  asset_pointer?: string;
  conversation_id?: string;
  message_id?: string;
  transformation_id?: string;
  [key: string]: unknown;
}

export interface ImageBatchResponse {
  items: RawImageItem[];
  cursor?: string;
  total_count?: number;
}

// 前端展示类型
export interface GalleryImageItem extends ImageItem {
  originalUrl?: string;
  encodings?: {
    thumbnail?: null | {
      path: string;
      originalPath?: string;
      blobUrl?: string;
    };
  };
}

export interface GalleryResponse {
  items: GalleryImageItem[];
  cursor?: string;
}

// 团队信息
export interface TeamAccount {
  id: string;
  display_name: string;
  is_deactivated: boolean;
}

// 任务相关类型 - 简化版本
export interface TaskMeta {
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

export interface ImageData {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title: string;
  created_at: number;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
}

// 现有任务响应
export interface ExistingTaskResponse {
  type: "existing_task_found";
  taskId: string;
  filename: string;
  downloadUrl: string;
  totalImages: number;
  createdAt?: number;
  ageHours: number;
  isProcessing: boolean;
  message: string;
}

// SSE事件类型 - 简化版本
export interface SseProgressEvent {
  type: "progress";
  message: string;
  progress: number;
}

export interface SseStatusEvent {
  type: "status";
  message: string;
  id?: string;
  progress?: number;
  totalImages?: number;
  filename?: string;
  downloadUrl?: string;
  error?: string;
  status?: string;
  stages?: {
    metadata: {
      status: "completed" | "running" | "pending" | "failed";
      progress: number;
      currentBatch?: number;
      totalImages?: number;
    };
  };
}

export interface SseDownloadReadyEvent {
  type: "download_ready";
  taskId: string;
  filename: string;
  downloadUrl: string;
  totalImages: number;
  missingThumbnails?: string[]; // Titles of images without thumbnails
}

export interface SseErrorEvent {
  type: "error";
  error: string;
}

export type SseEvent =
  | SseProgressEvent
  | SseStatusEvent
  | SseDownloadReadyEvent
  | SseErrorEvent;

// 前端状态类型 - 简化版本
export type ClientExportState =
  | "idle"
  | "checking"
  | "checking_existing"
  | "found_existing"
  | "existing_found"
  | "preparing"
  | "preparing_metadata"
  | "ready"
  | "metadata_ready"
  | "downloading"
  | "complete"
  | "export_complete"
  | "failed";

export interface ClientTaskDisplay {
  id?: string;
  totalImages?: number;
  totalImagesFinal?: number;
  downloadUrl?: string;
  filename?: string;
  ageHours?: number;
  isExisting?: boolean;
  isExistingTask?: boolean;
  isProcessing?: boolean;
  metadataStatus?: "completed" | "running" | "pending" | "failed";
  metadataProgress?: number;
  metadataCurrentBatch?: number;
  metadataTotalImages?: number;
  progress?: number;
  overallProgress?: number;
  thumbnailStats?: {
    total: number;
    missing: number[];
  };
  error?: string;
}
