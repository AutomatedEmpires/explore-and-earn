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

/**
 * Next's image optimizer cannot fetch the loopback Supabase service used by
 * local development and CI. Keep production Storage images optimized while
 * rendering only local Storage URLs directly.
 */
export function isLocalStorageUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/storage/v1/object/")) return false;
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Prove a benefit-photo URL belongs to the exact host/listing/kind/slot being
 * saved. Meals retain their pre-versioning exact-slot objects; every new upload
 * (and every housing role) uses a versioned child object.
 */
export function isOwnedBenefitPhotoUrl(
  url: string,
  hostProfileId: string,
  listingId: string,
  kind: EditableBenefitKind,
  slot: string,
): boolean {
  if (!isAllowedStorageUrl(url)) return false;
  try {
    const marker = "/storage/v1/object/public/listing-media/";
    const path = new URL(url).pathname.split(marker)[1];
    if (!path) return false;
    const base = `${hostProfileId}/benefit/${listingId}/${kind}/${slot}`;
    return path.startsWith(`${base}/`) || (kind === "meals" && path === base);
  } catch {
    return false;
  }
}
import type { EditableBenefitKind } from "@explore-and-earn/contracts";
