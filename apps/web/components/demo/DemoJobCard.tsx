"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DiscoveryCard,
  type DiscoveryCardData,
} from "@explore-and-earn/ui";

import { renderCardCoverImage } from "../discovery/CardCoverImage";
import { formatDate } from "../../lib/format";
import { getSitePhoto } from "../../lib/sitePhotos";
import {
  DEMO_LOCATIONS,
  DEMO_MATCHES,
  DEMO_ORGANIZATION,
  DEMO_ROLES,
} from "./full-fidelity";
import styles from "./demoChrome.module.css";

const role = DEMO_ROLES.find((candidate) => candidate.status === "live") ?? DEMO_ROLES[0];
if (!role) throw new Error("The full-fidelity demo scenario needs at least one role.");
const location = DEMO_LOCATIONS.find((candidate) => candidate.id === role.locationId);
const match = DEMO_MATCHES.find((candidate) => candidate.roleId === role.id);
const cover = getSitePhoto(role.coverPhoto.photoSlug).sizes.card.src;

function dateLabel(iso: string): string {
  return formatDate(`${iso}T12:00:00.000Z`, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function seasonLengthLabel(beginsOn: string, endsOn: string): string {
  const days = Math.max(
    1,
    Math.round(
      (new Date(`${endsOn}T12:00:00.000Z`).getTime() -
        new Date(`${beginsOn}T12:00:00.000Z`).getTime()) /
        86_400_000,
    ),
  );
  const months = Math.max(1, Math.round(days / 30.4));
  return `about ${months} month${months === 1 ? "" : "s"}`;
}

const cardData: DiscoveryCardData = {
  id: role.id,
  hostName: DEMO_ORGANIZATION.name,
  title: role.title,
  category: role.category,
  location: location ? `${location.locality}, ${location.region}` : "Location stated in listing",
  opportunityWindow: `${dateLabel(role.season.beginsOn)} – ${dateLabel(role.season.endsOn)}`,
  begins: dateLabel(role.season.beginsOn),
  ends: dateLabel(role.season.endsOn),
  seasonLength: seasonLengthLabel(role.season.beginsOn, role.season.endsOn),
  closesOn: role.season.applicationDeadline
    ? dateLabel(role.season.applicationDeadline)
    : undefined,
  coverImageUrl: cover,
  verifiedHost: true,
  matchScore: match?.score,
  matchConfidence: match?.confidence,
  triad: {
    housing: role.housing.summary,
    meals: role.meals.summary,
    pay: role.pay.summary,
  },
  benefitProvision: {
    housing: role.housing.provision,
    meals: role.meals.provision,
    pay: role.pay.provision,
  },
  housingSummary: role.housing.summary,
  mealsSummary: role.meals.summary,
  perks: role.benefits.slice(0, 3),
};

/** The production discovery card, backed by the shared fictional scenario. */
export function DemoJobCard() {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const destination = `/for-seekers/demo/listing/${role.id}`;

  const handlers = useMemo(
    () => ({
      onOpen: () => router.push(destination),
      onHostClick: () => router.push(`/for-seekers/demo/host/${DEMO_ORGANIZATION.id}`),
      onHousingClick: () => router.push(destination),
      onMealsClick: () => router.push(destination),
      onPayClick: () => router.push(destination),
      onLocationClick: () => router.push("/for-seekers/demo/map"),
      onDatesClick: () => router.push(destination),
      onSkip: () => setNotice("Skipped in this preview only."),
      onApply: () => router.push(`${destination}/apply`),
      onSave: () => setNotice("Saved in this preview only."),
      onReport: () => setNotice("This is fictional sample data, so no report was filed."),
      onVerificationClick: () =>
        setNotice("The badge demonstrates the paid-plan verified state; this host is fictional."),
      onMatchClick: () => setNotice("This sample match is derived from the shared demo profile."),
      onShare: () => setNotice("Sharing is disabled for fictional sample inventory."),
    }),
    [destination, router],
  );

  return (
    <div className={styles.cardHolder}>
      <DiscoveryCard
        data={cardData}
        surface="matched"
        imageLoading="eager"
        renderCoverImage={renderCardCoverImage}
        {...handlers}
      />
      {notice ? (
        <p className={styles.previewNote} role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
