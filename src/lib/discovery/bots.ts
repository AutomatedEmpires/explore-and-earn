// Crawlers and link previews are not views (SP3 spec 8.12). W0 stub: W3 replaces it (Task 24).

/** True for a known bot, a generic bot pattern, or a missing user agent. */
export function isBot(_userAgent: string | null): boolean {
  throw new Error('not implemented: isBot');
}
