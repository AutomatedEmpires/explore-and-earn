import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getClaimContextAction } from "../../../actions/listingClaims";
import { optionalAuth } from "../../../../lib/optionalAuth";
import { isUuid } from "../../../../lib/ids";
import { PublicShell } from "../../../../components/public/PublicShell";
import { ClaimListingForm } from "../../../../components/claim/ClaimListingForm";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim this opportunity",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Employer claim entry point for a SOURCED listing. A real employer asserts
 * authority; the claim routes into founder review, then (once approved) into
 * the confirm-and-convert flow. Only live sourced, unconverted listings are
 * claimable — anything else 404s or bounces to the listing.
 */
export default async function ClaimListingPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { userId } = await optionalAuth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=/claim/${id}`);
  }

  const { listing, myClaim } = await getClaimContextAction(id);
  if (!listing) notFound();

  // Only sourced, unclaimed-by-someone-else, live listings are claimable here.
  if (listing.provenance !== "sourced" || listing.status !== "live") {
    redirect(`/listing/${id}`);
  }

  return (
    <PublicShell>
      <div className={styles.page}>
        <ClaimListingForm
          listingId={id}
          listingTitle={listing.title}
          sourceName={listing.sourceName}
          employerName={listing.sourceEmployerName}
          existingClaim={myClaim}
        />
      </div>
    </PublicShell>
  );
}
