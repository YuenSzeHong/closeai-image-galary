// lib/chatgpt-client.ts - ChatGPT API Client Library

import { z } from "zod";
import type {
  ImageBatchResponse,
  ImageItem,
  RawImageItem,
  TeamAccount,
} from "./types.ts";

// Base configuration
const CHATGPT_PROXY_BASE_URL = "/api/proxy";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Types
export interface ChatGPTConfig {
  accessToken: string;
  teamId?: string;
  userAgent?: string;
  timeout?: number;
}

export interface ChatGPTRequestOptions {
  teamId?: string;
  timeout?: number;
}

interface AccountData {
  account?: {
    structure?: string;
    plan_type?: string;
    name?: string;
    is_deactivated?: boolean;
  };
}

interface AccountsResponse {
  accounts?: Record<string, AccountData>;
}

export interface FetchImageBatchOptions extends ChatGPTRequestOptions {
  after?: string;
  limit?: number;
  metadataOnly?: boolean;
}

export interface FetchAllMetadataOptions extends ChatGPTRequestOptions {
  maxBatches?: number;
  maxConsecutiveEmpty?: number;
  onProgress?: (progress: {
    currentBatch: number;
    totalImages: number;
    progress: number;
  }) => Promise<void>;
}

// Validation schemas
export const TokenSchema = z
  .string()
  .min(10, "访问令牌太短")
  .refine((val) => !val.includes(" "), {
    message: "访问令牌不应包含空格",
  });

// Error handling
export class ChatGPTApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public isCloudflareBlocked = false,
    public isUnauthorized = false,
    public isForbidden = false,
    public isRateLimited = false,
  ) {
    super(message);
    this.name = "ChatGPTApiError";
  }
}

/**
 * ChatGPT API Client
 */
export class ChatGPTClient {
  private config: ChatGPTConfig & {
    accessToken: string;
    userAgent: string;
    timeout: number;
  };

  constructor(config: ChatGPTConfig) {
    const tokenResult = TokenSchema.safeParse(config.accessToken);
    if (!tokenResult.success) {
      throw new ChatGPTApiError("无效的访问令牌格式");
    }

    this.config = {
      accessToken: this.cleanToken(config.accessToken),
      teamId: config.teamId,
      userAgent: config.userAgent || DEFAULT_USER_AGENT,
      timeout: config.timeout || 25000,
    };
  }

  /**
   * Clean token format (remove "Bearer " prefix if present)
   */
  private cleanToken(token: string): string {
    return token.startsWith("Bearer ")
      ? token.substring(7).trim()
      : token.trim();
  }

  /**
   * Validate if a team ID is considered "personal"
   */
  private isPersonalTeam(teamId?: string): boolean {
    return !teamId || teamId.trim() === "" || teamId.trim() === "personal";
  }

  /**
   * Normalize team ID for API calls
   */
  private normalizeTeamId(teamId?: string): string | undefined {
    return this.isPersonalTeam(teamId) ? undefined : teamId?.trim();
  }
  /**
   * Create headers for API requests
   */
  private createHeaders(options?: ChatGPTRequestOptions): HeadersInit {
    const headers: HeadersInit = {
      "x-access-token": this.config.accessToken,
    };

    const teamId = options?.teamId || this.config.teamId;
    const normalizedTeamId = this.normalizeTeamId(teamId);

    if (normalizedTeamId) {
      headers["x-team-id"] = normalizedTeamId;
    }

    return headers;
  } /**
   * Handle API response errors (legacy method, now simplified)
   */

  private handleApiError(response: Response, _errorBody: string): never {
    throw new ChatGPTApiError(
      `ChatGPT API 错误：${response.status} ${response.statusText}`,
      response.status,
    );
  }
  /**
   * Fetch a single batch of images
   */
  async fetchImageBatch(
    options: FetchImageBatchOptions = {},
  ): Promise<ImageBatchResponse> {
    const { after, limit = 50, metadataOnly = false, timeout } = options;
    const requestTimeout = timeout || this.config.timeout;

    const baseUrl = globalThis.location?.origin || "http://localhost:8000";
    const targetUrl = new URL(
      `${CHATGPT_PROXY_BASE_URL}/my/recent/image_gen`,
      baseUrl,
    );
    targetUrl.searchParams.set(
      "limit",
      String(limit && limit > 0 && limit <= 1000 ? limit : 50),
    );

    if (after) {
      targetUrl.searchParams.set("after", after);
    }

    if (metadataOnly) {
      targetUrl.searchParams.set("metadata_only", "true");
    }

    const headers = this.createHeaders(options);

    const response = await fetch(targetUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(requestTimeout),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: "Unknown error",
      }));
      throw new ChatGPTApiError(
        errorData.error || `API Error: ${response.status}`,
      );
    }

    const data = await response.json();

    // Validate response structure
    if (typeof data !== "object" || data === null) {
      throw new ChatGPTApiError("Invalid response format from ChatGPT API");
    }

    // Ensure items is always an array
    if (!Array.isArray(data.items)) {
      data.items = [];
    }

    return data;
  }
  /**
   * Fetch team/account list
   */
  async fetchTeamList(): Promise<TeamAccount[]> {
    const baseUrl = globalThis.location?.origin || "http://localhost:8000";
    const targetUrl = new URL(
      `${CHATGPT_PROXY_BASE_URL}/accounts/check/v4-2023-04-27`,
      baseUrl,
    );

    const headers = this.createHeaders();

    const response = await fetch(targetUrl.toString(), { headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: "Unknown error",
      }));
      throw new ChatGPTApiError(
        errorData.error || `API Error: ${response.status}`,
      );
    }

    const data = await response.json();
    const result: TeamAccount[] = [];
    let personalAccount: TeamAccount | null = null;

    if (data.accounts) {
      for (const [accountId, accountInfo] of Object.entries(data.accounts)) {
        if (accountId === "default") {
          continue;
        }
        const account = (accountInfo as AccountData).account || {};
        const structure = account.structure;
        const planType = account.plan_type || "unknown";
        const isDeactivated = account.is_deactivated || false;

        if (structure === "personal") {
          let displayName = "个人账户 (Personal)";
          if (planType && planType !== "unknown") {
            displayName += ` - ${planType}`;
          }
          personalAccount = {
            id: "", // Personal account uses empty string as ID
            display_name: displayName,
            is_deactivated: isDeactivated,
          };
        } else if (structure === "workspace") {
          const name = account.name || "团队账户";
          let displayName = name;
          if (planType && planType !== "unknown") {
            displayName += ` (${planType})`;
          }
          result.push({
            id: accountId,
            display_name: displayName,
            is_deactivated: isDeactivated,
          });
        }
      }
    }

    // Add personal account first if it exists
    if (personalAccount) {
      result.unshift(personalAccount);
    }

    return result;
  }

  /**
   * Fetch all image metadata with automatic batching and progress reporting
   */
  async fetchAllImageMetadata(
    options: FetchAllMetadataOptions = {},
  ): Promise<ImageItem[]> {
    const {
      maxBatches = 200,
      maxConsecutiveEmpty = 3,
      onProgress,
    } = options;

    const allImages: ImageItem[] = [];
    let cursor: string | null = null;
    let batchCount = 0;
    let consecutiveEmptyBatches = 0;
    let totalImagesFound = 0;

    console.log(
      `[Meta] Starting metadata fetch for teamId: ${
        options.teamId || this.config.teamId
      }`,
    );

    if (onProgress) {
      await onProgress({
        currentBatch: 0,
        totalImages: 0,
        progress: 0,
      });
    }

    while (batchCount < maxBatches) {
      try {
        const data = await this.fetchImageBatch({
          ...options,
          after: cursor || undefined,
          limit: 100, // Use reasonable batch size
        });

        batchCount++;

        if (!data.items || data.items.length === 0) {
          consecutiveEmptyBatches++;
          if (consecutiveEmptyBatches >= maxConsecutiveEmpty || !data.cursor) {
            console.log(
              `[Meta] No more items or consecutive empty. Batches: ${batchCount}`,
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
            `[Meta] Batch ${batchCount}: Found ${newImages.length} images. Total: ${totalImagesFound}`,
          );
        }

        cursor = data.cursor || null;
        if (!cursor) {
          console.log(
            `[Meta] No more cursor. Stopping. Batches: ${batchCount}`,
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
        if (error instanceof ChatGPTApiError) {
          // Handle rate limiting
          if (error.status === 429 || error.status === 403) {
            const waitTime = error.status === 429
              ? (Math.random() * 3000 + 5000)
              : (Math.random() * 5000 + 10000);
            console.warn(
              `[Meta] API limit (${error.status}). Waiting ${
                (waitTime / 1000).toFixed(1)
              }s... Batch: ${batchCount + 1}`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            continue;
          }
        }

        console.error(`[Meta] Batch ${batchCount + 1} failed:`, error);
        throw error;
      }
    }

    console.log(`[Meta] Fetched ${allImages.length} image metadata items.`);
    return allImages;
  }
}

// Factory function for creating client instances
export function createChatGPTClient(config: ChatGPTConfig): ChatGPTClient {
  return new ChatGPTClient(config);
}

// Utility functions (backward compatibility)
export function cleanToken(token: string): string {
  return token.startsWith("Bearer ") ? token.substring(7).trim() : token.trim();
}

export function isPersonalTeam(teamId?: string): boolean {
  return !teamId || teamId.trim() === "" || teamId.trim() === "personal";
}

export function normalizeTeamId(teamId?: string): string | undefined {
  return isPersonalTeam(teamId) ? undefined : teamId?.trim();
}

// Re-export types from central location
export type {
  GalleryImageItem,
  GalleryResponse,
  ImageBatchResponse,
  ImageItem,
  ImageMetadata,
  RawImageItem,
  TeamAccount,
  TeamInfo,
} from "./types.ts";
