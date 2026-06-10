import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminListingDetail } from "@explore-and-earn/db";

import { AdminListingCard } from "../../../../components/admin";
import { seekerApplicationListingToCardData } from "../../../../components/discovery";
import styles from "../../shared.module.css";
import detailStyles from "./page.module.css";

export const metadata: Metadata = { title: "Listing review" };
export const dynamic = "force-dynamic";

interface Props {
  readonly params: Promise<{ id: string }>;
}

export default async function AdminListingDetailPage({ params }: Props) {
  const { id } = await params;
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const listing = await getAdminListingDetail(serviceRoleToken, id).catch(
    () => null,
  );

  if (!listing) notFound();

  const cardData = seekerApplicationListingToCardData(listing);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <Link href="/admin/listings" className={detailStyles.back}>
          ← Listings
        </Link>
        <h1 className={styles.title}>{listing.title}</h1>
        <p className={styles.subtitle}>
          {listing.host.name} · {listing.location}
        </p>
      </header>

      <div className={detailStyles.cardWrap}>
        <AdminListingCard data={cardData} listingStatus={listing.status} />
      </div>
    </section>
  );
}
