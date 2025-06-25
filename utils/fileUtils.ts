// utils/fileUtils.ts - Utilities for file naming, extensions, and date formatting

/**
 * Format timestamp for use in filenames (safe for file systems)
 * @param timestampSeconds - Unix timestamp in seconds
 * @returns Formatted date string like "20231220_143052"
 */
export function formatDateForFilename(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return date.toISOString().slice(0, 19).replace(/[:-]/g, "").replace("T", "_");
}

/**
 * Sanitize a string for use as a filename
 * @param name - Original filename
 * @param maxLength - Maximum length for the filename (default: 200)
 * @returns Sanitized filename safe for file systems
 */
export function sanitizeFilename(name: string, maxLength = 200): string {
  return (name || "image_export")
    .replace(/[<>:"/\\|?*]+/g, "_")
    // deno-lint-ignore no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/^\.+/, "")
    .slice(0, maxLength);
}

/**
 * Extract file extension from URL (deprecated - use getExtensionFromContentType instead)
 * Most ChatGPT image URLs don't have meaningful extensions, MIME types are more reliable
 * @param url - Image URL
 * @returns File extension (e.g., "jpg", "png")
 * @deprecated Use getExtensionFromContentType for better reliability
 */
export function getExtensionFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const ext = path.split(".").pop()?.toLowerCase();
    if (
      ext &&
      ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg"].includes(ext)
    ) {
      return ext;
    }
  } catch (_e) {
    // ignore invalid URLs
  }
  return "jpg"; // Default fallback for images
}

/**
 * Determine file extension from Content-Type header - preferred method
 * @param contentType - Content-Type header value from response
 * @param fallbackUrl - Optional URL to extract extension from as last resort
 * @returns File extension based on MIME type or fallback
 */
export function getExtensionFromContentType(
  contentType: string | null,
  fallbackUrl?: string,
): string {
  // Primary: Use MIME type if available (most reliable for ChatGPT images)
  if (contentType) {
    const mimeType = contentType.toLowerCase().split(";")[0].trim();

    if (mimeType.startsWith("image/")) {
      const ext = mimeType.slice(6);
      // Handle common MIME type variations
      switch (ext) {
        case "jpeg":
          return "jpg";
        case "svg+xml":
          return "svg";
        case "x-icon":
          return "ico";
        default:
          // Validate extension is known image format
          if (
            ["jpg", "png", "gif", "webp", "bmp", "tiff", "svg", "ico"].includes(
              ext,
            )
          ) {
            return ext;
          }
      }
    }
  }

  // Secondary: Try URL extension (less reliable for ChatGPT URLs)
  if (fallbackUrl) {
    return getExtensionFromUrl(fallbackUrl);
  }

  // Final fallback: Default to jpg for images
  return "jpg";
}

/**
 * Get extension with response object (convenience method)
 * @param response - Fetch Response object
 * @param fallbackUrl - Optional URL fallback
 * @returns File extension
 */
export function getExtensionFromResponse(
  response: Response,
  fallbackUrl?: string,
): string {
  return getExtensionFromContentType(
    response.headers.get("content-type"),
    fallbackUrl,
  );
}
