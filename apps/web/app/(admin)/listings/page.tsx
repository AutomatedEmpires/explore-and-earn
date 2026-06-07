import type { Metadata } from "next";
import { getAllListingsForModeration } from "@explore-and-earn/db";

import { AdminListingsTable } from "../../../components/admin";
import styles from "../shared.module.css";

export const metadata: Metadata = { title: "Listings" };
export const dynamic = "force-dynamic";

export default async function AdminListingsPage() {
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const listings = await getAllListingsForModeration(serviceRoleToken);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Listing moderation</h1>
        <p className={styles.subtitle}>
          Approve, reject, and review every listing across the marketplace.
        </p>
      </header>
      <AdminListingsTable listings={listings} />
    </section>
  );
}
