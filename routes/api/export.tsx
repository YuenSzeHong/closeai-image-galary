// routes/api/export.ts - 使用第三方ZIP库
import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
// 使用Deno的ZIP库
import {
  BlobWriter,
  TextReader,
  ZipWriter,
} from "https://deno.land/x/zipjs@v2.7.34/index.js";

const ExportRequestSchema = z.object({
  token: z.string().min(10),
  teamId: z.string().optional(),
  includeMetadata: z.boolean().default(true),
});

interface ImageItem {
  id: string;
  url: string;
  title: string;
  created_at: number;
  width: number;
  height: number;
}

async function fetchAllImageMetadata(
  apiToken: string,
  teamId?: string,
): Promise<ImageItem[]> {
  const allImages: ImageItem[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const targetUrl = new URL(
      "https://chatgpt.com/backend-api/my/recent/image_gen",
    );
    targetUrl.searchParams.set("limit", "100");
    if (cursor) targetUrl.searchParams.set("after", cursor);

    const headers: HeadersInit = {
      "accept": "*/*",
      "authorization": "Bearer " + apiToken,
      "cache-control": "no-cache",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    if (teamId && teamId.trim() !== "" && teamId.trim() !== "personal") {
      headers["chatgpt-account-id"] = teamId.trim();
    }

    const response = await fetch(targetUrl.toString(), { headers });
    if (!response.ok) {
      throw new Error(
        `ChatGPT API 错误: ${response.status} ${response.statusText}`,
      );
    }
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      allImages.push(...data.items.map((item: {
        id: string;
        url: string;
        title?: string;
        created_at: number;
        width: number;
        height: number;
      }) => ({
        id: item.id,
        url: item.url,
        title: item.title || "无标题图像",
        created_at: item.created_at,
        width: item.width,
        height: item.height,
      })));
    }

    cursor = data.cursor;
    hasMore = !!cursor;
  }

  return allImages;
}

function formatDateForFilename(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().slice(0, 19).replace(/[:-]/g, "").replace("T", "_");
}

function sanitizeFilename(name: string, maxLength = 100): string {
  return (name || "image")
    .replace(/[<>:"/\\|?*\s]+/g, "_")
    // deno-lint-ignore no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, maxLength);
}

function getExtensionFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      return ext;
    }
  } catch (_e) {
    // ignore
  }
  return "jpg";
}

export const handler: Handlers = {
  async POST(req) {
    try {
      const body = await req.json();
      const { token, teamId, includeMetadata } = ExportRequestSchema.parse(
        body,
      );

      // 1. 获取所有图片元数据
      const allImages = await fetchAllImageMetadata(token, teamId);

      if (allImages.length === 0) {
        return Response.json({ error: "没有找到图片" }, { status: 404 });
      } // 2. 创建ZIP writer with BlobWriter
      const zipFileWriter = new BlobWriter();
      const zipWriter = new ZipWriter(zipFileWriter);

      // 3. 添加元数据文件
      if (includeMetadata) {
        const metadata = JSON.stringify(
          allImages.map((img) => ({
            id: img.id,
            title: img.title,
            created_at: img.created_at,
            width: img.width,
            height: img.height,
            original_url: img.url,
          })),
          null,
          2,
        );

        await zipWriter.add("metadata.json", new TextReader(metadata));
      }

      // 4. 分批添加图片
      let successful = 0;
      const BATCH_SIZE = 3; // 控制并发

      for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
        const batch = allImages.slice(i, i + BATCH_SIZE);

        for (const image of batch) {
          try {
            const response = await fetch(image.url);
            if (!response.ok) continue;

            const extension = getExtensionFromUrl(image.url);
            const datePrefix = formatDateForFilename(image.created_at);
            const titlePart = sanitizeFilename(image.title);
            const filename = `images/${datePrefix}_${titlePart}.${extension}`;

            // 直接从response stream添加到ZIP
            await zipWriter.add(filename, response.body);
            successful++;
          } catch (error) {
            console.warn(`跳过图片 ${image.title}:`, error);
          }
        }
      } // 5. 完成ZIP并获取数据
      const zipFileBlob = await zipWriter.close();

      if (successful === 0) {
        return Response.json({ error: "没有图片可以成功下载" }, {
          status: 500,
        });
      }

      // 6. 返回ZIP文件
      const workspaceName = teamId && teamId !== "personal"
        ? "team"
        : "personal";
      const timestamp = formatDateForFilename(Date.now() / 1000);

      return new Response(zipFileBlob, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition":
            `attachment; filename="chatgpt_images_${workspaceName}_${timestamp}.zip"`,
        },
      });
    } catch (error) {
      console.error("ZIP导出错误:", error);
      return Response.json(
        { error: (error as Error).message || "导出失败" },
        { status: 500 },
      );
    }
  },
};
