// Crawlers and link previews are not views (SP3 spec 8.12). The listing events route drops
// their events before anything is written.

/** The crawlers and link expanders spec 8.12 names. Most also match the generic pattern. */
const NAMED_BOTS =
  /googlebot|bingbot|applebot|duckduckbot|yandexbot|facebookexternalhit|twitterbot|slackbot|ahrefsbot|semrushbot/i;

/** Anything that calls itself a bot, crawler, spider, slurper or link preview. */
const GENERIC_BOT = /bot|crawl|spider|slurp|preview/i;

/** True for a known bot, a generic bot pattern, or a missing user agent. */
export function isBot(userAgent: string | null): boolean {
  if (userAgent === null || userAgent.trim() === '') return true;
  return NAMED_BOTS.test(userAgent) || GENERIC_BOT.test(userAgent);
}
