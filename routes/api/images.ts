import { Handlers } from "$fresh/server.ts";
import { z } from "zod";

interface ImageItem {
  id: string;
  url: string;
  originalUrl?: string;
  width: number;
  height: number;
  title: string;
  created_at: number;
  metadata?: Record<string, unknown>;
  encodings: {
    thumbnail: {
      path: string;
      originalPath?: string;
      blobUrl?: string;
    };
  };
}

interface GalleryResponse {
  items: ImageItem[];
  cursor?: string;
}

const TokenSchema = z
  .string()
  .min(10, "令牌太短")
  .refine((val) => !val.includes(" "), {
    message: "令牌不应包含空格",
  });

async function fetchSingleBatch(
  apiToken: string,
  teamId?: string,
  after?: string,
  limit?: number,
  metadataOnly = false,
): Promise<GalleryResponse> {
  const targetUrl = new URL(
    "https://chatgpt.com/backend-api/my/recent/image_gen",
  );
  targetUrl.searchParams.set(
    "limit",
    String(limit && limit > 0 && limit <= 1000 ? limit : 50),
  );
  if (after) targetUrl.searchParams.set("after", after);

  // Add metadata-only parameter if supported by API
  if (metadataOnly) {
    targetUrl.searchParams.set("metadata_only", "true");
  }

  const headers: HeadersInit = {
    "accept": "*/*",
    "authorization": "Bearer " + apiToken,
    "cache-control": "no-cache",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  // Only add team header if we have a real team ID (not "personal" or empty)
  if (teamId && teamId.trim() !== "" && teamId.trim() !== "personal") {
    headers["chatgpt-account-id"] = teamId.trim();
  }

  const response = await fetch(targetUrl.toString(), { headers });
  if (!response.ok) {
    const _errorBody = await response.text();

    console.debug(
      `ChatGPT API 请求失败: ${response.status} ${response.statusText}`,
      _errorBody,
    );
    
    // check if it is blocked by cloudflare
    if (_errorBody.includes("Cloudflare")) {
      throw new Error(
        "请求被 Cloudflare 阻止。请检查您的网络连接或尝试稍后再试。",
      );
    }

    if (response.status === 401) {
      throw new Error(
        "无效的 API 令牌或对指定账户未授权。",
      );
    }
    if (response.status === 403) {
      throw new Error(
        "访问被拒绝：请确保 API 令牌对该账户具有权限。",
      );
    }
    throw new Error(
      `ChatGPT API 错误：${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  const items: ImageItem[] = (data.items || []).map((item: any) => {
    return {
      id: item.id,
      url: item.url, // Keep original URL
      originalUrl: item.url,
      width: item.width,
      height: item.height,
      title: item.title,
      created_at: item.created_at,
      // Store the complete raw metadata from ChatGPT
      metadata: item, // Pass the entire raw response
      encodings: {
        thumbnail: {
          path: item.encodings?.thumbnail?.path || "", // Keep original thumbnail URL
          originalPath: item.encodings?.thumbnail?.path,
        },
      },
    };
  });
  return { items, cursor: data.cursor };
}

async function fetchImagesFromChatGPT(
  apiToken: string,
  teamId?: string,
  after?: string,
  limit?: number,
  metadataOnly = false,
): Promise<GalleryResponse> {
  const allItems: ImageItem[] = [];
  let currentCursor = after;
  let batchCount = 0;
  const maxBatches = 100; // Safety limit to prevent infinite loops
  
  // If a specific limit is set and it's reasonable, respect it for single batch
  if (limit && limit > 0 && limit <= 1000) {
    return await fetchSingleBatch(apiToken, teamId, after, limit, metadataOnly);
  }

  // Fetch all batches
  while (batchCount < maxBatches) {
    try {
      const batch = await fetchSingleBatch(
        apiToken,
        teamId,
        currentCursor,
        50, // Use smaller batch size for efficiency
        metadataOnly,
      );
      
      allItems.push(...batch.items);
      batchCount++;
      
      // If there's no cursor, we've reached the end
      if (!batch.cursor) {
        break;
      }
      
      currentCursor = batch.cursor;
      
      // Small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      // If we have some items already, return them instead of failing completely
      if (allItems.length > 0) {
        console.warn(`Failed to fetch batch ${batchCount + 1}, returning ${allItems.length} items:`, error);
        break;
      }
      throw error;
    }
  }
  
  if (batchCount >= maxBatches) {
    console.warn(`Reached maximum batch limit (${maxBatches}), returning ${allItems.length} items`);
  }

  return { items: allItems, cursor: undefined };
}

export const handler: Handlers = {
  async GET(req) {
    const token = req.headers.get("x-api-token");
    const teamId = req.headers.get("x-team-id");
    const url = new URL(req.url);

    const tokenResult = TokenSchema.safeParse(token);
    if (!tokenResult.success) {
      return Response.json(
        { error: "无效的 API 令牌", details: tokenResult.error.errors },
        { status: 401 },
      );
    }

    const after = url.searchParams.get("after");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const metadataOnly = url.searchParams.get("metadata_only") === "true";

    try {
      const images = await fetchImagesFromChatGPT(
        tokenResult.data,
        teamId || undefined,
        after || undefined,
        limit,
        metadataOnly,
      );
      return Response.json(images);
    } catch (error) {
      return Response.json(
        { error: (error as Error).message || "从源获取图像失败" },
        { status: 500 },
      );
    }
  },
};
