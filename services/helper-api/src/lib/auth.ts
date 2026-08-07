/**
 * Telegram user IDs arrive as numbers from the Bot API but as strings from
 * some n8n expressions/env vars — compare as strings to avoid float
 * precision loss on IDs near Number.MAX_SAFE_INTEGER and type mismatches.
 */
export function isAllowedUser(userId: string | number, allowedUserId: string | number): boolean {
  return String(userId) === String(allowedUserId);
}
