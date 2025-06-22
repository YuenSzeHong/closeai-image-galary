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

/**
 * Clean token format (remove "Bearer " prefix if present)
 */
function cleanToken(token: string): string {
  return token.startsWith("Bearer ")
    ? token.substring(7).trim()
    : token.trim();
}

/**
 * Example of fetching image metadata directly
 * @param accessToken - ChatGPT access token
 * @param options - Options for the request
 * @returns Image batch response
 */
export async function fetchImageMetadataDirect(
  accessToken: string,
  options: {
    teamId?: string;
    limit?: number;
    after?: string;
  } = {}
) {
  // Create a client with direct API access (no proxy)
  const client = createChatGPTClient({
    accessToken,
    teamId: options.teamId,
    useProxy: false // Use direct API calls
  });
  
  return client.fetchImageBatch({
    limit: options.limit,
    after: options.after
  });
}

/**
 * Example of fetching teams/accounts directly
 * @param accessToken - ChatGPT access token
 * @returns Team account list
 */
export async function fetchTeamsDirect(accessToken: string) {
  // Create a client with direct API access (no proxy)
  const client = createChatGPTClient({
    accessToken,
    useProxy: false // Use direct API calls
  });
  
  return client.fetchTeamList();
}
}

// Add type imports from the existing client
import type { 
  ImageBatchResponse,
  ImageItem,
  TeamAccount,
  RawImageItem
} from "../lib/types.ts";
import { createChatGPTClient } from "../lib/chatgpt-client.ts";

/**
 * Fetch all image metadata directly without using the proxy
 * @param accessToken - ChatGPT access token
 * @param options - Options for fetching all metadata
 * @returns Array of image items
 */
export async function fetchAllImageMetadataDirect(
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
  // Create a client with direct API access (no proxy)
  const client = createChatGPTClient({
    accessToken,
    teamId: options.teamId,
    useProxy: false // Use direct API calls
  });
  
  return client.fetchAllImageMetadata(options);
}

  while (batchCount < maxBatches) {
    try {
      const data = await fetchImageMetadataDirect(accessToken, {
        teamId,
        after: cursor || undefined,
        limit: 100, // Use reasonable batch size
      });

      batchCount++;

      if (!data.items || data.items.length === 0) {
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= maxConsecutiveEmpty || !data.cursor) {
          console.log(
            `[Meta Direct] No more items or consecutive empty. Batches: ${batchCount}`,
          );
          break;
        }
      } else {
        consecutiveEmptyBatches = 0;
        const newImages = data.items
          .map((item: RawImageItem): ImageItem | null => {
            if (!item.id || !item.url || !item.created_at) return null;
            return {
              id: item.id,
              url: item.url,
              title: item.title || "",
              created_at: item.created_at,
              width: item.width || 0,
              height: item.height || 0,
            };
          })
          .filter((item): item is ImageItem => item !== null);

        allImages.push(...newImages);
        totalImagesFound += newImages.length;

        console.log(
          `[Meta Direct] Batch ${batchCount}: Found ${newImages.length} images. Total: ${totalImagesFound}`,
        );
      }

      cursor = data.cursor || null;
      if (!cursor) {
        console.log(
          `[Meta Direct] No more cursor. Stopping. Batches: ${batchCount}`,
        );
        break;
      }

      // Report progress
      if (onProgress) {
        await onProgress({
          currentBatch: batchCount,
          totalImages: totalImagesFound,
          progress: Math.min((batchCount / maxBatches) * 100, 100),
        });
      }

      // Rate limiting - wait between requests
      if (batchCount % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      // Handle rate limiting
      if (error instanceof Error) {
        const status = error.message.includes("429") ? 429 : 
                      error.message.includes("403") ? 403 : 0;
        
        if (status === 429 || status === 403) {
          const waitTime = status === 429
            ? (Math.random() * 3000 + 5000)
            : (Math.random() * 5000 + 10000);
          console.warn(
            `[Meta Direct] API limit (${status}). Waiting ${
              (waitTime / 1000).toFixed(1)
            }s... Batch: ${batchCount + 1}`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
      }

      console.error(`[Meta Direct] Batch ${batchCount + 1} failed:`, error);
      throw error;
    }
  }

  console.log(`[Meta Direct] Fetched ${allImages.length} image metadata items.`);
  return allImages;
}
