const URL_RE = /https?:\/\/[^\s]+/gi;
const TRAILING = /[.,;:!?)]+$/;

/** Segments of `text`. Only http and https URLs link, and trailing punctuation stays out. */
export function findLinks(text: string): { text: string; href: string | null }[] {
  const out: { text: string; href: string | null }[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), href: null });
    const raw = match[0];
    const trimmed = raw.replace(TRAILING, '');
    const trailing = raw.slice(trimmed.length);
    let href: string | null = null;
    try {
      href = new URL(trimmed).toString();
    } catch {
      href = null;
    }
    out.push({ text: trimmed, href });
    if (trailing) out.push({ text: trailing, href: null });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), href: null });
  return out;
}

/** The URL's lowercased punycode hostname. */
export function displayHost(href: string): string {
  return new URL(href).hostname.toLowerCase();
}
