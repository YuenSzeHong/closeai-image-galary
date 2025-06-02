import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    const imageUrl = url.searchParams.get("url");

    if (!imageUrl) {
      return Response.json({ error: "Missing image URL" }, { status: 400 });
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image from source: ${response.status} ${response.statusText}`,
        );
      }
      const contentType = response.headers.get("content-type") || "image/jpeg";

      return new Response(response.body, {
        status: response.status,
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=86400",
          "access-control-allow-origin": "*",
        },
      });
    } catch (error) {
      return Response.json(
        { error: "Failed to proxy image", details: error.message },
        { status: 502 },
      );
    }
  },
};
