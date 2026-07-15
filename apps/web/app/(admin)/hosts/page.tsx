import type { Metadata } from "next";
import { getAllHostProfiles } from "@explore-and-earn/db";

import {
  AdminHostsTable,
  AdminPager,
  type AdminHostRowView,
} from "../../../components/admin";
import styles from "../shared.module.css";

export const metadata: Metadata = { title: "Hosts" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string }>;
}

const REVIEW_HOSTS: readonly AdminHostRowView[] = [
  {
    id: "host_review_orchard",
    companyName: "Wenatchee Orchard Co.",
    clerkUserId: "user_review_orchard",
    attestationStatus: "pending",
    subscriptionTier: "professional",
    flaggedForReview: true,
    flaggedReason: "Multiple recent spam reports",
    listingCount: 4,
  },
  {
    id: "host_review_fisheries",
    companyName: "North Pacific Fisheries Co-op",
    clerkUserId: "user_review_fisheries",
    attestationStatus: "attested",
    subscriptionTier: "professional",
    flaggedForReview: false,
    flaggedReason: null,
    listingCount: 2,
  },
  {
    id: "host_review_lodge",
    companyName: "Summit Pass Hospitality",
    clerkUserId: "user_review_lodge",
    attestationStatus: "pending",
    subscriptionTier: null,
    flaggedForReview: false,
    flaggedReason: null,
    listingCount: 1,
  },
];

export default async function AdminHostsPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const hasDataConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && serviceRoleToken,
  );
  if (!hasDataConfig && process.env.NODE_ENV === "production") {
    throw new Error("Admin host review requires the configured Supabase environment.");
  }

  // The dev mock bench is a visual/review surface and intentionally runs
  // without production credentials. Keep a small, explicitly synthetic trust
  // queue here so moderation hierarchy and responsive behavior remain testable.
  const result = hasDataConfig
    ? await getAllHostProfiles(serviceRoleToken, page)
    : {
        rows: REVIEW_HOSTS,
        page: 1,
        pageSize: REVIEW_HOSTS.length,
        total: REVIEW_HOSTS.length,
        totalPages: 1,
      };
  const { rows: hosts, ...pager } = result;

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
