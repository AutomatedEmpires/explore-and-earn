import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminListingDetail } from "@explore-and-earn/db";
import { Badge, Icon, type IconKey } from "@explore-and-earn/ui";

import { AdminListingCard } from "../../../../components/admin";
import { seekerApplicationListingToCardData } from "../../../../components/discovery";
import { humanizeToken, listingStatusVariant } from "../../../../components/admin/status";
import styles from "../../shared.module.css";
import detailStyles from "./page.module.css";

export const metadata: Metadata = { title: "Listing review" };
export const dynamic = "force-dynamic";

interface Props {
  readonly params: Promise<{ id: string }>;
}

type CheckState = "pass" | "flag";

interface ReviewCheck {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly state: CheckState;
  readonly icon: IconKey;
}

export default async function AdminListingDetailPage({ params }: Props) {
  const { id } = await params;
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const listing = await getAdminListingDetail(serviceRoleToken, id).catch(
    () => null,
  );

  if (!listing) notFound();

  const cardData = seekerApplicationListingToCardData(listing);

  /* ---- Honest disclosure checklist, derived ONLY from fields the detail
     query actually returns. No fabricated scores or match %. ---- */
  const housingDisclosed = listing.benefits.housing.provision === "provided";
  const mealsDisclosed = listing.benefits.meals.provision === "provided";
  const paySummary = listing.benefits.pay.summary ?? "";
  const payDisclosed =
    paySummary.length > 0 && paySummary !== "Unpaid / exchange";
  const hasPhoto = listing.coverImageUrl !== null;
  const hostVerified = listing.host.verified;
  const locationSet = listing.location !== "Location not specified";

  const checks: ReadonlyArray<ReviewCheck> = [
    {
      id: "pay",
      label: "Pay disclosed",
      detail: payDisclosed
        ? paySummary
        : "No pay range or exchange terms on the listing",
      state: payDisclosed ? "pass" : "flag",
      icon: "benefit.pay",
    },
    {
      id: "housing",
      label: "Housing disclosed",
      detail: housingDisclosed
        ? "Housing is marked as provided"
        : "Host has not confirmed housing",
      state: housingDisclosed ? "pass" : "flag",
      icon: "benefit.housing",
    },
    {
      id: "meals",
      label: "Meals disclosed",
      detail: mealsDisclosed
        ? "Meals are marked as provided"
        : "Host has not confirmed meals",
      state: mealsDisclosed ? "pass" : "flag",
      icon: "benefit.meals",
    },
    {
      id: "photo",
      label: "Cover photo",
      detail: hasPhoto
        ? "A cover photo is attached"
        : "No cover photo — the card falls back to a category plate",
      state: hasPhoto ? "pass" : "flag",
      icon: "nav.photos",
    },
    {
      id: "location",
      label: "Location set",
      detail: locationSet
        ? listing.location
        : "Location is not specified on the listing",
      state: locationSet ? "pass" : "flag",
      icon: "mappin.location",
    },
    {
      id: "host",
      label: "Host verified",
      detail: hostVerified
        ? `${listing.host.name} is an attested host`
        : `${listing.host.name} is not yet attested`,
      state: hostVerified ? "pass" : "flag",
      icon: "profile.verification",
    },
  ];

  const passed = checks.filter((check) => check.state === "pass").length;
  const flags = checks.length - passed;
  const allClear = flags === 0;

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <Link href="/listings" className={detailStyles.back}>
          <Icon name="action.back" size={16} aria-hidden />
          Listing moderation
        </Link>
        <h1 className={styles.title}>{listing.title || "Untitled listing"}</h1>
        <p className={styles.subtitle}>
          {listing.host.name} · {listing.location}
        </p>
      </header>

      <div className={detailStyles.workbench}>
        <div className={detailStyles.previewCol}>
          <p className={detailStyles.colLabel}>Seeker-facing preview</p>
          <div className={detailStyles.cardWrap}>
            <AdminListingCard data={cardData} listingStatus={listing.status} />
          </div>
        </div>

        <aside
          className={detailStyles.panel}
          aria-label="Moderation checklist"
        >
          <div className={detailStyles.panelHead}>
            <div className={detailStyles.panelHeadText}>
              <p className={detailStyles.panelEyebrow}>Review checklist</p>
              <p className={detailStyles.panelTitle}>
                {allClear
                  ? "All disclosures present"
                  : `${flags} ${flags === 1 ? "flag" : "flags"} to weigh`}
              </p>
            </div>
            <Badge
              label={humanizeToken(listing.status)}
              variant={listingStatusVariant(listing.status)}
            />
          </div>

          <div className={detailStyles.tally} aria-hidden="true">
            <div className={detailStyles.tallyTrack}>
              <span
                className={detailStyles.tallyFill}
                style={
                  {
                    "--tally-fill": passed / checks.length,
                  } as CSSProperties
                }
              />
            </div>
            <span className={detailStyles.tallyText}>
              {passed} of {checks.length} checks pass
            </span>
          </div>

          <ul className={detailStyles.checks}>
            {checks.map((check) => (
              <li
                key={check.id}
                className={`${detailStyles.check} ${
                  check.state === "flag" ? detailStyles.checkFlag : ""
                }`.trim()}
              >
                <span className={detailStyles.checkIcon}>
                  <Icon name={check.icon} size={20} aria-hidden />
                </span>
                <span className={detailStyles.checkBody}>
                  <span className={detailStyles.checkLabel}>{check.label}</span>
                  <span className={detailStyles.checkDetail}>
                    {check.detail}
                  </span>
                </span>
                <span
                  className={detailStyles.checkState}
                  role="img"
                  aria-label={check.state === "pass" ? "Pass" : "Flagged"}
                >
                  <Icon
                    name={
                      check.state === "pass"
                        ? "system.success"
                        : "system.warning"
                    }
                    size={20}
                    aria-hidden
                  />
                </span>
              </li>
            ))}
          </ul>

          <p className={detailStyles.panelNote}>
            Use the Approve and Remove controls on the preview card to make the
            decision. Flags are advisory — not every listing needs every field.
          </p>
        </aside>
      </div>
    </section>
  );
}
