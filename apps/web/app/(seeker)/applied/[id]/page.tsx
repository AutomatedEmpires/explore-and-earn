import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@clerk/nextjs/server";
import {
  getSeekerApplicationRichById,
  type RichSeekerApplication,
} from "@explore-and-earn/db";
import {
  Badge,
  Icon,
  VerifiedHostBadge,
  type BadgeProps,
} from "@explore-and-earn/ui";

import { BucketPage } from "../../../../components/seeker";
import { CATEGORY_ICON } from "../../../../components/discovery";
import { WithdrawButton } from "../WithdrawButton";
import styles from "./detail.module.css";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { userId, getToken } = await auth();
  if (!userId) return { title: "Application" };
  const token = await getToken({ template: "supabase" });
  if (!token) return { title: "Application" };
  const application = await getSeekerApplicationRichById(token, userId, id).catch(() => null);
  const title = application?.listing?.title
    ? `Application — ${application.listing.title}`
    : "Application";
  return {
    title,
    robots: { index: false },
  };
}

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  reviewing: "Reviewing",
  saved_by_host: "Saved by host",
  offered: "Offer received",
  accepted: "Accepted",
  active: "Active",
  completed: "Completed",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  applied: "neutral",
  reviewing: "info",
  saved_by_host: "match",
  offered: "success",
  accepted: "success",
  active: "match",
  completed: "neutral",
  not_selected: "neutral",
  withdrawn: "neutral",
  expired: "neutral",
};

/**
 * Statuses a seeker may withdraw from — mirrors WITHDRAWABLE_STATUSES in
 * packages/db/src/queries/seekerApplicationsRich.ts. `offered` is excluded:
 * that has its own accept/decline path instead of a withdraw.
 */
const WITHDRAWABLE_STATUSES = new Set<string>(["applied", "reviewing", "saved_by_host"]);

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
}

interface TimelineStep {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly at: string | null;
}

function buildTimeline(application: RichSeekerApplication): TimelineStep[] {
  const declinedOffer = application.withdrawnReason === "offer_declined";
  const acceptedOffer = application.status === "accepted";
  return [
    {
      key: "submitted",
      label: "Application submitted",
      description: "You applied to this opportunity.",
      at: formatDate(application.submittedAt),
    },
    {
      key: "reviewed",
      label: "Reviewed by host",
      description: "The host opened and reviewed your application.",
      at: formatDate(application.reviewedAt),
    },
    {
      key: "decided",
      label: declinedOffer
        ? "Offer declined"
        : acceptedOffer
          ? "Offer accepted"
          : "Decision made",
      description: declinedOffer
        ? "You declined the host's offer."
        : acceptedOffer
          ? "You accepted the host's offer."
          : "The host reached a final decision.",
      at: formatDate(application.decidedAt),
    },
  ];
}

export default async function AppliedDetailPage({ params }: Props) {
  const { id } = await params;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    notFound();
  }

  const application = await getSeekerApplicationRichById(token, userId, id);

  if (!application) {
    notFound();
  }

  const { listing, status } = application;
  const label =
    status === "withdrawn" && application.withdrawnReason === "offer_declined"
      ? "Offer declined"
      : (STATUS_LABEL[status] ?? "Applied");
  const variant = STATUS_VARIANT[status] ?? "neutral";
  const canWithdraw = WITHDRAWABLE_STATUSES.has(status);
  const timeline = buildTimeline(application);

  return (
    <BucketPage
      title={listing?.title ?? "Application"}
      description="Where your application stands."
    >
      <Link className={styles.back} href="/applied">
        <Icon name="action.back" size={16} aria-hidden />
        Back to applications
      </Link>

      <article className={styles.summary}>
        <div className={styles.frame}>
          {listing?.coverImageUrl ? (
            <Image
              className={styles.cover}
              src={listing.coverImageUrl}
              alt={`${listing.title} cover photo`}
              fill
              sizes="(max-width: 640px) 100vw, 120px"
            />
          ) : (
            <span className={styles.coverFallback}>
              {listing ? (
                <Icon
                  name={CATEGORY_ICON[listing.category]}
                  size={24}
                  aria-hidden
                />
              ) : null}
            </span>
          )}
        </div>
        <div className={styles.summaryBody}>
          <Badge label={label} variant={variant} />
          <h2 className={styles.summaryTitle}>
            {listing?.title ?? "Listing no longer available"}
          </h2>
          {listing ? (
            <div className={styles.hostRow}>
              <span className={styles.hostName}>{listing.host.name}</span>
              {listing.host.verified ? <VerifiedHostBadge /> : null}
            </div>
          ) : null}
          {listing ? (
            <Link
              className={styles.listingLink}
              href={`/listing/${listing.id}`}
            >
              View listing
            </Link>
          ) : null}
          {canWithdraw ? (
            <WithdrawButton applicationId={application.id} />
          ) : null}
        </div>
      </article>

      <section className={styles.timeline}>
        <h3 className={styles.timelineHeading}>Status timeline</h3>
        <ol className={styles.steps}>
          {timeline.map((step) => {
            const reached = step.at !== null;
            return (
              <li
                key={step.key}
                className={
                  reached ? styles.step : `${styles.step} ${styles.stepPending}`
                }
              >
                <span className={styles.dot} aria-hidden />
                <div className={styles.stepBody}>
                  <p className={styles.stepLabel}>{step.label}</p>
                  <p className={styles.stepDescription}>{step.description}</p>
                  <p className={styles.stepDate}>{step.at ?? "Pending"}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {application.coverMessage ? (
        <section className={styles.message}>
          <h3 className={styles.timelineHeading}>Your note to the host</h3>
          <p className={styles.messageBody}>{application.coverMessage}</p>
        </section>
      ) : null}
    </BucketPage>
  );
}
