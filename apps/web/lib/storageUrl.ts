/**
 * Validate that a host-supplied media URL points at our own Supabase Storage,
 * so a malicious client can't persist an arbitrary off-origin URL into a listing
 * column or benefit_details. Used by every server action that stores a photo URL
 * (listings cover/gallery, benefit photos).
 *
 * Accepts the configured Supabase origin from NEXT_PUBLIC_SUPABASE_URL — which
 * covers local dev (http://127.0.0.1:54321) and cloud (https://<ref>.supabase.co)
 * identically — and, as a production safety net, any https *.supabase.co host.
 * An empty/undefined URL is allowed (means "leave unset / clear").
 */
export function isAllowedStorageUrl(url: string | undefined | null): boolean {
  if (!url) return true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.pathname.startsWith("/storage/v1/object/")) return false;

  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configured) {
    try {
      const base = new URL(configured);
      if (parsed.protocol === base.protocol && parsed.host === base.host) return true;
    } catch {
      // Misconfigured env — fall through to the cloud safety net below.
    }
  }
  return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co");
}
