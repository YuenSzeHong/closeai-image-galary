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
