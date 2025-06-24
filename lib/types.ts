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
}

export interface RawImageItem {
  id: string;
  url: string;
  title?: string;
  created_at: number;
  width?: number;
  height?: number;
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
    thumbnail?: {
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
}

export interface SseDownloadReadyEvent {
  type: "download_ready";
  taskId: string;
  filename: string;
  downloadUrl: string;
  totalImages: number;
  thumbnailStats?: {
    total: number;
    available: number;
  };
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
  | "found_existing"
  | "preparing"
  | "ready"
  | "downloading"
  | "complete"
  | "failed";

export interface ClientTaskDisplay {
  id?: string;
  totalImages?: number;
  downloadUrl?: string;
  filename?: string;
  ageHours?: number;
  isExisting?: boolean;
  isProcessing?: boolean;
  thumbnailStats?: {
    total: number;
    available: number;
  };
  error?: string;
}