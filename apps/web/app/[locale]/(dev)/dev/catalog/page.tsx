import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogClient } from "../../../../../components/dev/catalog/CatalogClient";
import { isDevBenchEnabled } from "../../../../../lib/devBench";

export const metadata: Metadata = {
  title: "Card + Popup Catalog · Dev",
  robots: { index: false, follow: false },
};

/**
 * Card + Popup Catalog (review tooling only).
 *
 * A single dev-only gallery that visualises EVERY DiscoveryCard variation and
 * EVERY sitewide popup at any screen size, driven entirely by local fixtures —
 * never production data. Gated exactly like /dev via `isDevBenchEnabled()`, so
 * it returns 404 in production / Vercel preview and is never bundled there.
 *
 * See ../page.tsx (the Mock Bench launcher) for the sibling dev surface.
 */
export default function CatalogPage() {
  if (!isDevBenchEnabled()) notFound();
  return (
    <main>
      <CatalogClient />
    </main>
  );
}
