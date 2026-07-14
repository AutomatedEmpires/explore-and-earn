import type { Metadata } from "next";
import { getRecentApplications } from "@explore-and-earn/db";

import { AdminApplicationsTable } from "../../../../components/admin";
import styles from "../shared.module.css";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

export default async function AdminApplicationsPage() {
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const applications = await getRecentApplications(serviceRoleToken, 50);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Application pipeline</h1>
        <p className={styles.subtitle}>
          The 50 most recent applications across the marketplace.
        </p>
      </header>
      <AdminApplicationsTable applications={applications} />
    </section>
  );
}
