import { Handlers } from "$fresh/server.ts";
import { z } from "zod";

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
): Promise<any> {
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

  // Return raw response data with validation
  const data = await response.json();
  
  // Validate response structure
  if (typeof data !== 'object' || data === null) {
    throw new Error("Invalid response format from ChatGPT API");
  }
  
  // Ensure items is always an array
  if (!Array.isArray(data.items)) {
    data.items = [];
  }
  
  return data;
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
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const metadataOnly = url.searchParams.get("metadata_only") === "true";

    try {
      const rawData = await fetchSingleBatch(
        tokenResult.data,
        teamId || undefined,
        after || undefined,
        limit,
        metadataOnly,
      );
      return Response.json(rawData);
    } catch (error) {
      return Response.json(
        { error: (error as Error).message || "从源获取图像失败" },
        { status: 500 },
      );
    }
  },
};
