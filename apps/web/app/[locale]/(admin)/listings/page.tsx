import type { Metadata } from "next";
import { getAllListingsForModeration } from "@explore-and-earn/db";

import { AdminListingsTable, AdminPager } from "../../../../components/admin";
import styles from "../shared.module.css";

export const metadata: Metadata = { title: "Listings" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function AdminListingsPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const { rows: listings, ...pager } = await getAllListingsForModeration(
    serviceRoleToken,
    page,
  );

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Listing moderation</h1>
        <p className={styles.subtitle}>
          Approve, reject, and review every listing across the marketplace.
        </p>
      </header>
      <AdminListingsTable listings={listings} />
      <AdminPager basePath="/listings" {...pager} />
    </section>
  );
}
