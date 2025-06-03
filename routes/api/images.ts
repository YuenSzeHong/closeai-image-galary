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
  metadata?: any;
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
  .min(10, "Token too short")
  .refine((val) => !val.includes(" "), {
    message: "Token should not contain spaces",
  });

async function fetchImagesFromChatGPT(
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
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
  
  // Only add team header if we have a real team ID (not "personal" or empty)
  if (teamId && teamId.trim() !== "" && teamId.trim() !== "personal") {
    headers["chatgpt-account-id"] = teamId.trim();
  }

  

  const response = await fetch(targetUrl.toString(), { headers });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new Error(
        "Invalid API token or unauthorized for the specified account.",
      );
    }
    if (response.status === 403) {
      throw new Error(
        "Access forbidden: Ensure API token has permissions for the account.",
      );
    }
    throw new Error(
      `ChatGPT API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  const items: ImageItem[] = (data.items || []).map((item: any) => {
    const originalFullUrl = item.url;
    const originalThumbnailPath = item.encodings?.thumbnail?.path;
    return {
      id: item.id,
      url: `/api/proxy?url=${encodeURIComponent(originalFullUrl)}`,
      originalUrl: originalFullUrl,
      width: item.width,
      height: item.height,
      title: item.title,
      created_at: item.created_at,
      metadata: item.metadata,
      encodings: {
        thumbnail: {
          path: originalThumbnailPath
            ? `/api/proxy?url=${encodeURIComponent(originalThumbnailPath)}`
            : "",
          originalPath: originalThumbnailPath,
        },
      },
    };
  });
  return { items, cursor: data.cursor };
}

export const handler: Handlers = {
  async GET(req) {
    const token = req.headers.get("x-api-token");
    const teamId = req.headers.get("x-team-id");
    const url = new URL(req.url);

    const tokenResult = TokenSchema.safeParse(token);
    if (!tokenResult.success) {
      return Response.json(
        { error: "Invalid API token", details: tokenResult.error.errors },
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
        { error: error.message || "Failed to fetch images from source" },
        { status: 500 },
      );
    }
  },
};
