// utils/dateUtils.ts - Date formatting utilities

/**
 * Format timestamp for display in the UI
 * @param timestamp - Unix timestamp in seconds
 * @returns Localized date string
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
