// utils/chatgpt.ts - Simple ChatGPT API utilities

import { type ImageItem } from "../lib/chatgpt-client.ts";
import { getCachedClient } from "../utils/metadataUtils.ts";

/**
 * Simple utility to fetch ChatGPT images with sensible defaults
 */
export function fetchChatGPTImages(
  accessToken: string,
  options?: {
    teamId?: string;
    maxImages?: number;
    onProgress?: (
      progress: { current: number; total: number; progress: number },
    ) => void;
  },
): Promise<ImageItem[]> {
  const client = getCachedClient(accessToken, {
    teamId: options?.teamId,
    bypassProxy: false, // Use proxy for client-side operations
  });

  const maxBatches = options?.maxImages
    ? Math.ceil(options.maxImages / 50)
    : 200;

  return client.fetchAllImageMetadata({
    teamId: options?.teamId,
    maxBatches,
    onProgress: options?.onProgress
      ? (progress) => {
        options.onProgress!({
          current: progress.totalImages,
          total: progress.totalImages,
          progress: progress.progress,
        });
        return Promise.resolve();
      }
      : undefined,
  });
}

/**
 * Simple utility to get ChatGPT teams/accounts
 */
export function getChatGPTTeams(accessToken: string) {
  const client = getCachedClient(accessToken, {
    bypassProxy: false, // Use proxy for client-side operations
  });
  return client.fetchTeamList();
}

/**
 * Validate ChatGPT access token
 */
export async function validateChatGPTToken(
  accessToken: string,
  teamId?: string,
): Promise<boolean> {
  try {
    const client = getCachedClient(accessToken, {
      teamId,
      bypassProxy: false, // Use proxy for client-side operations
    });
    // Try to fetch a small batch to validate the token
    await client.fetchImageBatch({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}

// Re-export the client utilities for advanced usage
export {
  type ChatGPTConfig,
  createChatGPTClient,
} from "../lib/chatgpt-client.ts";
export { getCachedClient } from "../utils/metadataUtils.ts";
