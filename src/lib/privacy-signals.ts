// Privacy signals and the session replay guard (legal review 4.5, P0 item 18).
//
// Global Privacy Control counts as a rejection everywhere, not only in the EU. When the
// browser sends it, PostHog never loads (analytics-client.tsx), server `track` sends nothing
// (apiRoute puts the refusal in the request context), and apiRoute records the opt-out on a
// signed-in account (users.analytics_opt_out_at).
//
// Session replay stays off in production, so in every environment: Sentry samples no replays
// and drops any replay integration, and PostHog's recording is disabled. privacy-signals.test.ts
// also checks that no code turns replay on.
//
// No imports: the browser bundle, apiRoute and the Sentry configs all use this file.

/** True when the request carries `Sec-GPC: 1`. */
export function gpcFromHeaders(headers: { get(name: string): string | null }): boolean {
  return headers.get('sec-gpc')?.trim() === '1';
}

/** True when the browser reports `navigator.globalPrivacyControl === true`. */
export function gpcInBrowser(nav: unknown): boolean {
  return (
    typeof nav === 'object' &&
    nav !== null &&
    'globalPrivacyControl' in nav &&
    nav.globalPrivacyControl === true
  );
}

/** The current browser's signal; false outside a browser. */
export function browserSendsGpc(): boolean {
  return typeof navigator !== 'undefined' && gpcInBrowser(navigator);
}

/** Sentry's screen-recording integrations (`Replay`, `ReplayCanvas`). They are never installed. */
export function isReplayIntegration(name: string): boolean {
  return /^Replay/.test(name);
}
