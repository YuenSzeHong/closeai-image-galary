// utils/metadataUtils.ts - Utilities for formatting metadata values

/**
 * Format a value for display in metadata panels
 * @param value - The value to format
 * @returns Formatted string representation
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") {
    // Handle timestamps
    if (
      typeof value === "number" && value > 1000000000 && value < 10000000000
    ) {
      return new Date(value * 1000).toLocaleString();
    }
    return value.toString();
  }
  if (typeof value === "string") {
    // Handle URLs
    if (value.startsWith("http")) {
      return value;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map((v) => formatValue(v)).join(", ")
      : "空数组";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Check if a value is a URL
 * @param value - The value to check
 * @returns true if the value is a URL string
 */
export function isUrl(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("http");
}

// ChatGPT utility functions moved to chatgpt-client.ts

/**
 * Example of fetching image metadata directly
 * @param accessToken - ChatGPT access token
 * @param options - Options for the request
 * @returns Image batch response
 */
export function fetchImageMetadataDirect(
  accessToken: string,
  options: {
    teamId?: string;
    limit?: number;
    after?: string;
  } = {},
) {
  // Get a cached client with direct API access (no proxy)
  const client = getCachedClient(accessToken, {
    teamId: options.teamId,
    bypassProxy: true, // Use direct API calls
  });

  return client.fetchImageBatch({
    limit: options.limit,
    after: options.after,
  });
}

// Client cache to avoid recreating the same client multiple times
const clientCache = new Map<
  string,
  { client: ChatGPTClient; timestamp: number }
>();
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get a cached client or create a new one if not in cache
 * @param accessToken - ChatGPT access token
 * @param options - Client options
 * @returns ChatGPT client instance
 */
export function getCachedClient(
  accessToken: string,
  options: { teamId?: string; bypassProxy?: boolean } = {},
) {
  // Create a cache key based on the configuration
  const cacheKey = `${accessToken}:${options.teamId || ""}:${
    options.bypassProxy ? "direct" : "proxy"
  }`;

  // Check if we have a valid cached client
  const now = Date.now();
  const cached = clientCache.get(cacheKey);

  if (cached && (now - cached.timestamp) < CLIENT_CACHE_TTL) {
    return cached.client;
  }

  // Create a new client
  const client = createChatGPTClient({
    accessToken,
    teamId: options.teamId,
    bypassProxy: options.bypassProxy,
  });

  // Cache the client
  clientCache.set(cacheKey, { client, timestamp: now });

  // Cleanup old entries occasionally
  if (clientCache.size > 10) {
    for (const [key, value] of clientCache.entries()) {
      if ((now - value.timestamp) > CLIENT_CACHE_TTL) {
        clientCache.delete(key);
      }
    }
  }

  return client;
}

// Add type imports from the existing client
import type {
  ImageItem,
  // Unused types commented out to prevent lint warnings
  // ImageBatchResponse,
  // TeamAccount,
  // RawImageItem
} from "../lib/types.ts";
import { ChatGPTClient, createChatGPTClient } from "../lib/chatgpt-client.ts";

/**
 * Fetch all image metadata directly without using the proxy
 * @param accessToken - ChatGPT access token
 * @param options - Options for fetching all metadata
 * @returns Array of image items
 */
export function fetchAllImageMetadataDirect(
  accessToken: string,
  options: {
    teamId?: string;
    maxBatches?: number;
    maxConsecutiveEmpty?: number;
    onProgress?: (progress: {
      currentBatch: number;
      totalImages: number;
      progress: number;
    }) => Promise<void>;
  } = {},
): Promise<ImageItem[]> {
  // Get a cached client with direct API access (no proxy)
  const client = getCachedClient(accessToken, {
    teamId: options.teamId,
    bypassProxy: true, // Use direct API calls
  });

  return client.fetchAllImageMetadata(options);
}

// Zod schemas for thumbnail validation
import { z } from "zod";

const ThumbnailPathSchema = z.object({
  path: z.string().refine((str) => typeof str === "string" && str.length > 0)
    .optional(),
  url: z.string().refine((str) => typeof str === "string" && str.length > 0)
    .optional(),
});

const ThumbnailContainerSchema = z.object({
  thumbnail: ThumbnailPathSchema.optional(),
  encodings: z.object({
    thumbnail: z.union([ThumbnailPathSchema, z.null()]).optional(),
    source: z.record(z.unknown()).nullable().optional(),
    unfurl: z.record(z.unknown()).nullable().optional(),
    md: z.record(z.unknown()).nullable().optional(),
  }).optional(),
  thumbnailUrl: z.string().refine((str) =>
    typeof str === "string" && str.length > 0
  ).optional(),
  thumbnail_url: z.string().refine((str) =>
    typeof str === "string" && str.length > 0
  ).optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough(); // Allow additional properties

export type ThumbnailContainer = z.infer<typeof ThumbnailContainerSchema>;

// Interface for image objects that may contain thumbnail information.
// Based on the actual raw JSON response format (2025 version)
export interface ImageWithThumbnail extends ThumbnailContainer {
  id: string;
  url: string;
  width?: number;
  height?: number;
  title?: string;
  created_at: number;
  // New fields from raw JSON response
  tags?: string[];
  kind?: string;
  generation_id?: string;
  generation_type?: string;
  prompt?: string | null;
  output_blocked?: boolean;
  source?: string;
  is_archived?: boolean;
  asset_pointer?: string;
  conversation_id?: string;
  message_id?: string;
  transformation_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Extract thumbnail URL from various image object structures.
 * This function checks a series of common locations for a thumbnail URL
 * based on the ChatGPT API response format.
 *
 * @param img The image object that may contain thumbnail information.
 * @returns Thumbnail URL or undefined if not found.
 */
export function extractThumbnailUrl(
  img: Record<string, unknown>,
): string | undefined {
  // Parse and validate the input using our Zod schema
  const result = ThumbnailContainerSchema.safeParse(img);
  if (!result.success) {
    console.debug("Invalid thumbnail container:", result.error);
    return undefined;
  }

  const validated = result.data;

  // Check all possible thumbnail URL locations in order of preference
  if (
    validated.encodings?.thumbnail &&
    validated.encodings.thumbnail !== null &&
    validated.encodings.thumbnail.path &&
    typeof validated.encodings.thumbnail.path === "string" &&
    validated.encodings.thumbnail.path.startsWith("http")
  ) {
    return validated.encodings.thumbnail.path;
  }

  if (
    validated.encodings?.thumbnail?.url &&
    typeof validated.encodings.thumbnail.url === "string" &&
    validated.encodings.thumbnail.url.startsWith("http")
  ) {
    return validated.encodings.thumbnail.url;
  }

  if (
    validated.thumbnailUrl && typeof validated.thumbnailUrl === "string" &&
    validated.thumbnailUrl.startsWith("http")
  ) {
    return validated.thumbnailUrl;
  }

  if (
    validated.thumbnail_url && typeof validated.thumbnail_url === "string" &&
    validated.thumbnail_url.startsWith("http")
  ) {
    return validated.thumbnail_url;
  }

  // Check metadata paths if available
  if (validated.metadata) {
    const metadataResult = ThumbnailContainerSchema.safeParse(
      validated.metadata,
    );
    if (metadataResult.success) {
      const metadata = metadataResult.data;
      if (metadata.encodings?.thumbnail?.path) {
        return metadata.encodings.thumbnail.path;
      }
      if (metadata.encodings?.thumbnail?.url) {
        return metadata.encodings.thumbnail.url;
      }
      if (metadata.thumbnailUrl) {
        return metadata.thumbnailUrl;
      }
      if (metadata.thumbnail_url) {
        return metadata.thumbnail_url;
      }
    }
  }

  // No valid thumbnail URL found
  return undefined;
}
