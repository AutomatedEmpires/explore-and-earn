import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";
import { getMarketplaceStats } from "@explore-and-earn/db";

import { AdminShell } from "../../../components/admin";
import { isAdminUserId } from "../../../lib/admin";
import "../../../styles/admin-os.css";

/**
 * Real moderation badge + marketplace-health for the shell chrome, derived from
 * the same getMarketplaceStats read the overview uses. Resilient: any failure
 * (missing service key, transient error) yields safe zeros so the shell always
 * renders and the moderation surfaces stay reachable. Server-only — the service
 * key is never serialized to the client.
 */
async function resolveShellStats(): Promise<{
  readonly queueCount: number;
  readonly healthScore: number;
}> {
  try {
    const stats = await getMarketplaceStats(
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );
    const queueCount = stats.underReviewListings + stats.pendingApplications;
    const denom =
      stats.totalListings + stats.totalHosts + stats.pendingApplications;
    const healthScore =
      denom > 0
        ? Math.round(
            ((stats.liveListings + stats.verifiedHosts) / denom) * 100,
          )
        : 0;
    return { queueCount, healthScore };
  } catch {
    return { queueCount: 0, healthScore: 0 };
  }
}

export const metadata: Metadata = {
  title: {
    default: "Admin · Explore & Earn",
    template: "%s · Admin · Explore & Earn",
  },
  description:
    "Founder operations center — moderate listings, verify hosts, and monitor marketplace health.",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  // FOUNDER GATE (belt-and-suspenders with Clerk middleware): only the
  // hard-coded ADMIN_CLERK_USER_ID may reach any admin surface. Anyone else —
  // signed in or not — is bounced home.
  const { userId } = await auth();
  if (!isAdminUserId(userId)) {
    redirect("/");
  }

  const { queueCount, healthScore } = await resolveShellStats();

  // Admin OS — warm "Adventure Paper & Sky" moderation command center, sky
  // accent + warm-red danger register. The .admin-os token cascade flips the
  // scope; AdminShell owns the chrome (and links the REAL admin routes — the
  // legacy AdminSidebar linked broken /admin/* paths).
  return (
    <div className="admin-os">
      <AdminShell adminName="Founder" queueCount={queueCount} healthScore={healthScore}>
        {children}
      </AdminShell>
    </div>
  );
}
