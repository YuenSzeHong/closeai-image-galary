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

// ChatGPT Base URL
const CHATGPT_BASE_URL = "https://chatgpt.com/backend-api";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Make a direct call to ChatGPT API without using the proxy
 * @param path - API path (without leading slash)
 * @param options - Request options
 * @returns Response data
 */
export async function directChatGPTCall<T = unknown>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    accessToken: string;
    teamId?: string;
    body?: unknown;
    queryParams?: Record<string, string>;
  }
): Promise<T> {
  const {
    method = "GET",
    accessToken,
    teamId,
    body,
    queryParams = {},
  } = options;

  // Build target URL
  const targetUrl = new URL(`${CHATGPT_BASE_URL}/${path}`);
  
  // Add query parameters
  for (const [key, value] of Object.entries(queryParams)) {
    targetUrl.searchParams.set(key, value);
  }

  // Prepare headers
  const headers: HeadersInit = {
    "accept": "*/*",
    "authorization": "Bearer " + cleanToken(accessToken),
    "cache-control": "no-cache",
    "user-agent": DEFAULT_USER_AGENT,
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "en-US,en;q=0.9",
    "connection": "keep-alive",
  };

  // Add team ID if provided
  if (teamId && teamId.trim() !== "" && teamId.trim() !== "personal") {
    headers["chatgpt-account-id"] = teamId.trim();
  }

  // Add content-type for POST/PUT with body
  if (body && (method === "POST" || method === "PUT")) {
    headers["content-type"] = "application/json";
  }

  // Prepare request
  const requestInit: RequestInit = {
    method,
    headers,
  };

  // Add body for POST/PUT requests
  if (body && (method === "POST" || method === "PUT")) {
    requestInit.body = JSON.stringify(body);
  }

  // Make request to ChatGPT API
  const response = await fetch(targetUrl.toString(), requestInit);

  // Handle errors
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    let errorMessage = `ChatGPT API error: ${response.status} ${response.statusText}`;
    
    if (errorText.includes("Cloudflare")) {
      errorMessage = "Request blocked by Cloudflare. Please check your network connection or try again later.";
    } else if (response.status === 401) {
      errorMessage = "Invalid access token or unauthorized.";
    } else if (response.status === 403) {
      errorMessage = "Access denied. Please ensure your access token has permissions for this account.";
    } else if (response.status === 429) {
      errorMessage = "Too many requests. Please try again later.";
    }
    
    throw new Error(errorMessage);
  }

  // Return response data
  return await response.json() as T;
}

// Use the centralized cleanToken utility from chatgpt-client
import { cleanToken } from "../lib/chatgpt-client.ts";

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
  } = {}
) {
  // Get a cached client with direct API access (no proxy)
  const client = getCachedClient(accessToken, {
    teamId: options.teamId,
    bypassProxy: true // Use direct API calls
  });
  
  return client.fetchImageBatch({
    limit: options.limit,
    after: options.after
  });
}

// Client cache to avoid recreating the same client multiple times
const clientCache = new Map<string, { client: ChatGPTClient, timestamp: number }>();
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get a cached client or create a new one if not in cache
 * @param accessToken - ChatGPT access token
 * @param options - Client options
 * @returns ChatGPT client instance
 */
export function getCachedClient(accessToken: string, options: { teamId?: string, bypassProxy?: boolean } = {}) {
  // Create a cache key based on the configuration
  const cacheKey = `${accessToken}:${options.teamId || ''}:${options.bypassProxy ? 'direct' : 'proxy'}`;
  
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
    bypassProxy: options.bypassProxy
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
import { createChatGPTClient, ChatGPTClient } from "../lib/chatgpt-client.ts";

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
  } = {}
): Promise<ImageItem[]> {
  // Get a cached client with direct API access (no proxy)
  const client = getCachedClient(accessToken, {
    teamId: options.teamId,
    bypassProxy: true // Use direct API calls
  });
  
  return client.fetchAllImageMetadata(options);
}
