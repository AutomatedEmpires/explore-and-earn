/**
 * Trim a search query and, when requested, cap it without splitting a UTF-16
 * surrogate pair. The bound remains a code-unit limit, matching HTML
 * `maxLength`, while every returned string stays safe for encodeURIComponent.
 */
export function normalizeSearchQuery(
  value: string,
  maxLength?: number,
): string {
  const trimmed = value.trim();
  if (maxLength === undefined) return trimmed;

  const limit = Number.isFinite(maxLength)
    ? Math.max(0, Math.floor(maxLength))
    : 0;
  if (trimmed.length <= limit) return trimmed;

  const limited = trimmed.slice(0, limit);
  const finalCodeUnit = limited.charCodeAt(limited.length - 1);
  const endsWithHighSurrogate =
    finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff;
  return endsWithHighSurrogate ? limited.slice(0, -1) : limited;
}
