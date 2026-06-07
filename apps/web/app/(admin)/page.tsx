import type { Metadata } from "next";
import { getMarketplaceStats } from "@explore-and-earn/db";

import { StatCard } from "../../components/admin";
import styles from "./shared.module.css";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // Service role key is read server-side only and handed to the db layer; it is
  // never serialized to the client (this is a server component).
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const stats = await getMarketplaceStats(serviceRoleToken);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Marketplace health</h1>
        <p className={styles.subtitle}>
          Live counts across listings, applications, hosts, and seekers.
        </p>
      </header>
      <div className={styles.grid}>
        <StatCard label="Total listings" value={stats.totalListings} />
        <StatCard label="Live" value={stats.liveListings} />
        <StatCard label="Under review" value={stats.underReviewListings} />
        <StatCard label="Drafts" value={stats.draftListings} />
        <StatCard label="Total applications" value={stats.totalApplications} />
        <StatCard
          label="Pending applications"
          value={stats.pendingApplications}
          hint="Status: applied"
        />
        <StatCard
          label="Accepted applications"
          value={stats.acceptedApplications}
        />
        <StatCard label="Total hosts" value={stats.totalHosts} />
        <StatCard label="Verified hosts" value={stats.verifiedHosts} />
        <StatCard label="Total seekers" value={stats.totalSeekers} />
      </div>
    </section>
  );
}
