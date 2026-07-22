import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getClaimConfirmationFields,
  getHostProfile,
} from "@explore-and-earn/db";

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
 * Employer claim surface for a SOURCED listing — status-aware across the whole
 * claim-to-verify journey. A caller WITH a claim on this listing always sees
 * their claim's real state (pending review, approved, confirming, converted,
 * rejected), even after the listing itself converted or closed. A caller
 * WITHOUT a claim can only start one on a live sourced, unconverted listing —
 * anything else 404s or bounces to the listing.
 */
export default async function ClaimListingPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { userId, getToken } = await optionalAuth();
  if (!userId) {
    redirect(
      `/sign-in?role=host&redirect_url=${encodeURIComponent(`/claim/${id}`)}`,
    );
  }

  const { listing, myClaim } = await getClaimContextAction(id);
  if (!listing) notFound();

  // No claim of your own → only sourced, live listings are claimable here.
  if (!myClaim && (listing.provenance !== "sourced" || listing.status !== "live")) {
    redirect(`/listing/${id}`);
  }

  // The field-review step needs every sourced value, prefetched server-side.
  // Only the claimant of a CONFIRMING claim ever receives this payload.
  const confirmationPrefill =
    myClaim?.status === "confirming" ? await getClaimConfirmationFields(id) : null;
  const confirmationHostProfile =
    myClaim?.status === "confirming" && myClaim.hostProfileId && getToken
      ? await getToken()
          .then((token) =>
            token ? getHostProfile(token, userId).catch(() => null) : null,
          )
          .catch(() => null)
      : null;
  const confirmationBenefitLibrary =
    confirmationHostProfile && confirmationHostProfile.id === myClaim?.hostProfileId
      ? confirmationHostProfile.benefitLibrary
      : null;

  return (
    <PublicShell>
      <div className={styles.page}>
        <ClaimListingForm
          listingId={id}
          listingTitle={listing.title}
          sourceName={listing.sourceName}
          employerName={listing.sourceEmployerName}
          existingClaim={myClaim}
          confirmationPrefill={confirmationPrefill}
          confirmationBenefitLibrary={confirmationBenefitLibrary}
          confirmationBenefitLibraryAvailable={
            confirmationHostProfile?.benefitLibraryAvailable === true
          }
        />
      </div>
    </PublicShell>
  );
}
