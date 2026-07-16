import type { Metadata } from "next";
import { getRefundQueue, getRefundStats } from "@explore-and-earn/db";

import { RefundQueue } from "../../../../../components/admin";
import styles from "../../shared.module.css";

export const metadata: Metadata = { title: "Refunds" };
export const dynamic = "force-dynamic";

export default async function AdminRefundsPage() {
  // Service role key is read server-side only and handed to the db layer; it is
  // never serialized to the client (this is a server component).
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const [requests, stats] = await Promise.all([
    getRefundQueue(serviceRoleToken),
    getRefundStats(serviceRoleToken),
  ]);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Refund requests</h1>
        <p className={styles.subtitle}>
          Review host refund requests on subscriptions, announcements, and
          boosts. Approving issues the real Stripe refund and records the outcome;
          denying closes the request with no money moved.
        </p>
      </header>
      <RefundQueue requests={requests} stats={stats} />
    </section>
  );
}
