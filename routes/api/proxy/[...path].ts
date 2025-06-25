// routes/api/proxy/[...path].ts - Unified ChatGPT Backend API Proxy
import { FreshContext, Handlers } from "$fresh/server.ts";

const CHATGPT_BASE_URL = "https://chatgpt.com/backend-api";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const handler: Handlers = {
  GET(req, ctx) {
    return handleProxyRequest(req, ctx);
  },

  POST(req, ctx) {
    return handleProxyRequest(req, ctx);
  },

  PUT(req, ctx) {
    return handleProxyRequest(req, ctx);
  },

  DELETE(req, ctx) {
    return handleProxyRequest(req, ctx);
  },
};

async function handleProxyRequest(
  req: Request,
  ctx: FreshContext,
): Promise<Response> {
  try {
    // Extract path from URL params
    const { path } = ctx.params;
    const pathSegments = Array.isArray(path) ? path : [path];
    const targetPath = pathSegments.join("/");

    // debug log
    console.log(`[proxy] ${req.method} ${req.url}`);

    // Get access token from header
    const accessToken = req.headers.get("x-access-token");
    if (!accessToken) {
      return Response.json(
        { error: "Missing access token" },
        { status: 401 },
      );
    }

    // Build target URL
    const url = new URL(req.url);
    const targetUrl = new URL(`${CHATGPT_BASE_URL}/${targetPath}`);

    // Copy query parameters
    for (const [key, value] of url.searchParams.entries()) {
      targetUrl.searchParams.set(key, value);
    }

    // Prepare headers for ChatGPT API
    const headers: HeadersInit = {
      "accept": "*/*",
      "authorization": "Bearer " +
        accessToken.replace(/^Bearer\s+/i, "").trim(),
      "cache-control": "no-cache",
      "user-agent": DEFAULT_USER_AGENT,
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "en-US,en;q=0.9",
      "connection": "keep-alive",
    };

    // Add team ID if provided
    const teamId = req.headers.get("x-team-id");
    if (teamId && teamId.trim() !== "" && teamId.trim() !== "personal") {
      headers["chatgpt-account-id"] = teamId.trim();
    }

    // Copy content-type for POST/PUT requests
    const contentType = req.headers.get("content-type");
    if (contentType && (req.method === "POST" || req.method === "PUT")) {
      headers["content-type"] = contentType;
    }

    // Make request to ChatGPT API
    const proxyRequest: RequestInit = {
      method: req.method,
      headers,
    };

    // Add body for POST/PUT requests
    if (req.method === "POST" || req.method === "PUT") {
      proxyRequest.body = req.body;
    }

    const response = await fetch(targetUrl.toString(), proxyRequest);

    // Handle errors with consistent format
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");

      // Check for common error types
      if (errorBody.includes("Cloudflare")) {
        return Response.json(
          {
            error:
              "Request blocked by Cloudflare. Please check your network connection or try again later.",
          },
          { status: response.status },
        );
      }

      if (response.status === 401) {
        return Response.json(
          {
            error:
              "Invalid access token or unauthorized for the specified account.",
          },
          { status: 401 },
        );
      }

      if (response.status === 403) {
        return Response.json(
          {
            error:
              "Access denied. Please ensure your access token has permissions for this account.",
          },
          { status: 403 },
        );
      }

      if (response.status === 429) {
        return Response.json(
          { error: "Too many requests. Please try again later." },
          { status: 429 },
        );
      }

      return Response.json(
        {
          error: `ChatGPT API error: ${response.status} ${response.statusText}`,
          details: errorBody.substring(0, 200),
        },
        { status: response.status },
      );
    }

    // Get response data
    const responseData = await response.json();

    // Return the response with CORS headers
    return Response.json(responseData, {
      status: response.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, x-access-token, x-team-id",
      },
    });
  } catch (error) {
    console.error("Proxy request failed:", error);
    return Response.json(
      {
        error: "Proxy request failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// Handle preflight requests
export const OPTIONS = (): Response => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, x-access-token, x-team-id",
    },
  });
};
