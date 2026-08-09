import type { Metadata } from "next";
import { getAllHostProfiles } from "@explore-and-earn/db";

import {
  AdminHostsTable,
  AdminPager,
  type AdminHostRowView,
  readAdminQuery,
} from "../../../../components/admin";
import { isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";
import styles from "../shared.module.css";

export const metadata: Metadata = { title: "Hosts" };
export const dynamic = "force-dynamic";

const DEV_HOST_PAGE_SIZE = 2;
const DEV_HOSTS_BY_PAGE: Readonly<
  Record<number, ReadonlyArray<AdminHostRowView>>
> = {
  1: [
    {
      id: "dev-host-coastal-crew",
      companyName: "Coastal & Crew",
      clerkUserId: "user_dev_coastal_3a7b",
      attestationStatus: "attested",
      subscriptionTier: "professional",
      flaggedForReview: false,
      flaggedReason: null,
      listingCount: 4,
    },
    {
      id: "dev-host-north-star",
      companyName: "North Star Lodge",
      clerkUserId: "user_dev_northstar_8k2m",
      attestationStatus: "pending",
      subscriptionTier: null,
      flaggedForReview: true,
      flaggedReason: "hidden-dev-fixture-reason",
      listingCount: 1,
    },
  ],
  2: [
    {
      id: "dev-host-juniper-wake",
      companyName: "Juniper Wake",
      clerkUserId: "user_dev_juniper_9p2k",
      attestationStatus: "verified",
      subscriptionTier: "starter",
      flaggedForReview: false,
      flaggedReason: null,
      listingCount: 1,
    },
  ],
};

interface Props {
  readonly searchParams: Promise<{
    readonly page?: string | string[];
    readonly q?: string | string[];
  }>;
}

export default async function AdminHostsPage({ searchParams }: Props) {
  const { page: pageParam, q } = await searchParams;
  const pageValue = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const page = Math.max(1, Number.parseInt(pageValue ?? "1", 10) || 1);
  const query = readAdminQuery(q);

  const isDevReview =
    isDevBenchEnabled() && (await readDevRole()) === "admin";
  const { rows: hosts, ...pager } = isDevReview
    ? {
        rows: DEV_HOSTS_BY_PAGE[page] ?? [],
        page,
        pageSize: DEV_HOST_PAGE_SIZE,
        total: 3,
        totalPages: 2,
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
      <AdminHostsTable hosts={hosts} initialQuery={query} />
      <AdminPager basePath="/hosts" query={query} {...pager} />
    </section>
  );
}
