import type { Metadata } from "next";
import { getAllHostProfiles } from "@explore-and-earn/db";

import { AdminHostsTable } from "../../../components/admin";
import styles from "../shared.module.css";

export const metadata: Metadata = { title: "Hosts" };
export const dynamic = "force-dynamic";

export default async function AdminHostsPage() {
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const hosts = await getAllHostProfiles(serviceRoleToken);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Host verification</h1>
        <p className={styles.subtitle}>
          Review host profiles and manage attestation status.
        </p>
      </header>
      <AdminHostsTable hosts={hosts} />
    </section>
  );
}
