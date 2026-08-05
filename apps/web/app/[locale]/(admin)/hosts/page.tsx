import type { Metadata } from "next";
import { ADMIN_PAGE_SIZE, getAllHostProfiles } from "@explore-and-earn/db";

import { AdminHostsTable, AdminPager } from "../../../../components/admin";
import { isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";
import styles from "../shared.module.css";

export const metadata: Metadata = { title: "Hosts" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function AdminHostsPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const isDevReview =
    isDevBenchEnabled() && (await readDevRole()) === "admin";
  const { rows: hosts, ...pager } = isDevReview
    ? {
        rows: [],
        page,
        pageSize: ADMIN_PAGE_SIZE,
        total: 0,
        totalPages: 1,
      }
    : await getAllHostProfiles(
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        page,
      );

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Host verification</h1>
        <p className={styles.subtitle}>
          Review host profiles and manage attestation status.
        </p>
      </header>
      <AdminHostsTable hosts={hosts} />
      <AdminPager basePath="/hosts" {...pager} />
    </section>
  );
}
