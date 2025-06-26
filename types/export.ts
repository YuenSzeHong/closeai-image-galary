// types/export.ts - Export-related type definitions

export interface TaskMeta {
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
  finalZipSizeBytes?: number; // Store final ZIP file size for HEAD requests
}

export interface ActiveDownload {
  taskId: string;
  connectionId: string;
  controller: ReadableStreamDefaultController | null;
  startTime: number;
  userAgent?: string;
  isDownloadManager: boolean;
  disconnected: boolean;
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
