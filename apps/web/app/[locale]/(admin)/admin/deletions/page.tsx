import type { Metadata } from "next";
import { getOpenAccountDeletionRequests } from "@explore-and-earn/db";

import { DeletionQueue } from "../../../../../components/admin/DeletionQueue";
import styles from "../../shared.module.css";

export const metadata: Metadata = { title: "Deletion requests" };
export const dynamic = "force-dynamic";

/**
 * The erasure queue.
 *
 * Migration 079 made the "Deletion request received" confirmation TRUE by
 * recording the request; without an operator surface it was still true and
 * useless — requests accumulated where nobody could see them. Erasure runs
 * against a statutory clock (GDPR Art. 17, CCPA/CPRA), so this lists the oldest
 * first and shows how long each has been waiting.
 */
export default async function AdminDeletionsPage() {
  // Server component: the service-role key is read here and handed to the db
  // layer, never serialized to the client.
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const requests = await getOpenAccountDeletionRequests(serviceRoleToken);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Account deletion requests</h1>
        <p className={styles.subtitle}>
          Oldest first — erasure requests run against a statutory deadline. Marking
          one resolved records the decision and who made it; it does not itself
          delete data, because a host may still have live listings, in-flight
          applications or payment obligations to settle first.
        </p>
      </header>
      <DeletionQueue requests={requests} />
    </section>
  );
}
