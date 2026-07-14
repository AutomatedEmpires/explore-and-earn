import type { Metadata } from "next";
import { getModerationStats, getReportsQueue } from "@explore-and-earn/db";

import { ModerationWorkbench } from "../../../../../components/admin";
import styles from "../../shared.module.css";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  // Service role key is read server-side only and handed to the db layer; it is
  // never serialized to the client (this is a server component).
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const [reports, stats] = await Promise.all([
    getReportsQueue(serviceRoleToken),
    getModerationStats(serviceRoleToken),
  ]);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Moderation queue</h1>
        <p className={styles.subtitle}>
          Review seeker-flagged listings and take action — dismiss, warn, remove
          content, or suspend. Every decision is logged to an audit trail.
        </p>
      </header>
      <ModerationWorkbench reports={reports} stats={stats} />
    </section>
  );
}
