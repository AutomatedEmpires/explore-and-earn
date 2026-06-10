import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@clerk/nextjs/server";
import {
  getSeekerApplicationsRich,
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
import styles from "./detail.module.css";

export const metadata: Metadata = {
  title: "Application",
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
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
      label: "Decision made",
      description: "The host reached a final decision.",
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

  const applications = await getSeekerApplicationsRich(token, userId);
  const application = applications.find((a) => a.id === id);

  if (!application) {
    notFound();
  }

  const { listing, status } = application;
  const label = STATUS_LABEL[status] ?? "Applied";
  const variant = STATUS_VARIANT[status] ?? "neutral";
  const timeline = buildTimeline(application);

  return (
    <BucketPage
      title={listing?.title ?? "Application"}
      description="Where your application stands."
    >
      <Link className={styles.back} href="/applied">
        ← Back to applications
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
