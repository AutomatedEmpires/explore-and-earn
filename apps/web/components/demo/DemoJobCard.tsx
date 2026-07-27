"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { ListingCardGrid } from "../discovery/ListingCard";
import { DEMO_LISTING } from "./enterpriseDemo";
import styles from "./demoChrome.module.css";

/**
 * The demo opportunity rendered by the REAL DiscoveryCard.
 *
 * This is the point of the whole exercise: a host looking at this is looking at
 * the component a seeker sees in Seek, Swipe and Map, not a marketing drawing
 * of it. The listing is a fixture, the card is production code.
 *
 * EVERY popup handler is overridden, deliberately. The card's default handlers
 * open drawers that read the database for the listing id they are given
 * (BenefitTrustModal), navigate to /host/<id> and /listing/<id> (which do not
 * exist for a fixture), or file a moderation report against it. A demo fixture
 * must not be able to reach any of those, so each tap lands on the demo surface
 * that answers the same question honestly.
 */
export function DemoJobCard() {
  const router = useRouter();

  const overrides = useMemo(
    () => ({
      onOpen: () => router.push("/for-hosts/demo/job"),
      onHostClick: () => router.push("/for-hosts/demo/profile"),
      onHousingClick: () => router.push("/for-hosts/demo/job"),
      onMealsClick: () => router.push("/for-hosts/demo/job"),
      onPayClick: () => router.push("/for-hosts/demo/job"),
      onLocationClick: () => router.push("/map"),
      // Nothing to report: this listing does not exist outside this module.
      onReport: () => {},
    }),
    [router],
  );

  return (
    <ListingCardGrid
      listings={[DEMO_LISTING]}
      surface="matched"
      overrides={overrides}
      className={styles.cardHolder}
      eagerCount={1}
    />
  );
}
