import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { auth } from "@clerk/nextjs/server";
import {
  getSchedulingRequestForApplication,
  getSeekerApplicationRichById,
  type RichSeekerApplication,
} from "@explore-and-earn/db";
import {
  Badge,
  Icon,
  VerifiedHostBadge,
  type BadgeProps,
} from "@explore-and-earn/ui";

import { BucketPage, OfferedActions } from "../../../../../components/seeker";
import { CATEGORY_ICON } from "../../../../../components/discovery";
import {
  ACCEPTED_ITEMS,
  DEV_ACCEPTED_APPLICATION_ID,
  DEV_ACCEPTED_BEGINS_AT,
  DEV_ACCEPTED_ENDS_AT,
  DEV_OFFERED_APPLICATION_ID,
  DEV_OFFERED_BEGINS_AT,
  DEV_OFFERED_ENDS_AT,
  NOT_SELECTED_ITEMS,
  OFFER_ITEMS,
} from "../../../../../components/seeker/fixtures";
import { OpenConversationButton } from "../../../../../components/messaging/OpenConversationButton";
import { InterviewScheduleCard } from "../../../../../components/scheduling/InterviewScheduleCard";
import { isDevBenchEnabled } from "../../../../../lib/devBench";
import { readDevRole } from "../../../../../lib/devBench/server";
import { isUuid } from "../../../../../lib/ids";
import { WithdrawButton } from "../WithdrawButton";
import styles from "./detail.module.css";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const DEV_APPLICATION_DETAIL_ID = "dev-application-vineyard-not-selected";

interface ApplicationDetailData {
  readonly application: RichSeekerApplication;
  readonly scheduling: Awaited<
    ReturnType<typeof getSchedulingRequestForApplication>
  >;
}

function devApplicationDetail(): ApplicationDetailData {
  const item = NOT_SELECTED_ITEMS[0];
  if (!item) {
    throw new Error("Application detail fixture requires a not-selected item.");
  }

  const { listing } = item;
  return {
    application: {
      id: DEV_APPLICATION_DETAIL_ID,
      listingId: listing.id,
      status: "not_selected",
      expiresAt: null,
      canStartConversation: false,
      submittedAt: "2026-05-12T17:00:00.000Z",
      reviewedAt: "2026-05-15T17:00:00.000Z",
      decidedAt: "2026-05-20T17:00:00.000Z",
      coverMessage:
        "I’m excited to contribute during harvest and bring reliable guest-service experience. I’m comfortable with early starts, hands-on cellar work, and shared team responsibilities throughout the season.",
      listing: {
        id: listing.id,
        title: listing.title,
        category: listing.category,
        location: listing.location,
        opportunityWindow: listing.opportunityWindow,
        status: listing.status,
        host: {
          name: listing.host.name,
          verified: listing.host.verified,
        },
        benefits: listing.benefits,
        coverImageUrl: listing.coverImageUrl ?? null,
        beginsAt: listing.begins ?? null,
        endsAt: listing.ends ?? null,
        conditionalBadges: listing.conditionalBadges,
        matchScore: listing.matchScore,
      },
    },
    scheduling: { available: true, request: null },
  };
}

function devAcceptedApplicationDetail(): ApplicationDetailData {
  const item = ACCEPTED_ITEMS[0];
  if (!item) {
    throw new Error("Application detail fixture requires an accepted item.");
  }

  const { listing } = item;
  return {
    application: {
      id: DEV_ACCEPTED_APPLICATION_ID,
      listingId: listing.id,
      status: "accepted",
      expiresAt: null,
      // This local-only application is intentionally not persisted, so it
      // cannot truthfully open a real conversation.
      canStartConversation: false,
      submittedAt: "2026-05-03T17:00:00.000Z",
      reviewedAt: "2026-05-05T17:00:00.000Z",
      decidedAt: "2026-05-08T17:00:00.000Z",
      coverMessage: null,
      listing: {
        id: listing.id,
        title: listing.title,
        category: listing.category,
        location: listing.location,
        opportunityWindow: listing.opportunityWindow,
        status: listing.status,
        host: {
          name: listing.host.name,
          verified: listing.host.verified,
        },
        benefits: listing.benefits,
        coverImageUrl: listing.coverImageUrl ?? null,
        beginsAt: DEV_ACCEPTED_BEGINS_AT,
        endsAt: DEV_ACCEPTED_ENDS_AT,
        conditionalBadges: listing.conditionalBadges,
        matchScore: listing.matchScore,
      },
    },
    scheduling: { available: true, request: null },
  };
}

function devOfferedApplicationDetail(): ApplicationDetailData {
  const item = OFFER_ITEMS[0];
  if (!item) {
    throw new Error("Application detail fixture requires an offered item.");
  }

  const { listing } = item;
  return {
    application: {
      id: DEV_OFFERED_APPLICATION_ID,
      listingId: listing.id,
      status: "offered",
      expiresAt: null,
      // This local-only application is intentionally not persisted, so it
      // cannot truthfully open a real conversation.
      canStartConversation: false,
      submittedAt: "2026-05-24T17:00:00.000Z",
      reviewedAt: null,
      decidedAt: null,
      coverMessage: null,
      listing: {
        id: listing.id,
        title: listing.title,
        category: listing.category,
        location: listing.location,
        opportunityWindow: listing.opportunityWindow,
        status: listing.status,
        host: {
          name: listing.host.name,
          verified: listing.host.verified,
        },
        benefits: listing.benefits,
        coverImageUrl: listing.coverImageUrl ?? null,
        beginsAt: DEV_OFFERED_BEGINS_AT,
        endsAt: DEV_OFFERED_ENDS_AT,
        conditionalBadges: listing.conditionalBadges,
        matchScore: listing.matchScore,
      },
    },
    scheduling: { available: false, request: null },
  };
}

/**
 * React cache keeps metadata and the page on one request-scoped read. The exact
 * local fixture route returns before Clerk, Supabase, or scheduling can run.
 */
const resolveApplicationDetail = cache(
  async (id: string): Promise<ApplicationDetailData | null> => {
    if (
      id === DEV_APPLICATION_DETAIL_ID ||
      id === DEV_ACCEPTED_APPLICATION_ID ||
      id === DEV_OFFERED_APPLICATION_ID
    ) {
      if (!isDevBenchEnabled() || (await readDevRole()) !== "seeker") {
        return null;
      }
      if (id === DEV_ACCEPTED_APPLICATION_ID) {
        return devAcceptedApplicationDetail();
      }
      if (id === DEV_OFFERED_APPLICATION_ID) {
        return devOfferedApplicationDetail();
      }
      return devApplicationDetail();
    }
    if (!isUuid(id)) return null;

    const { userId, getToken } = await auth();
    if (!userId) return null;
    const token = await getToken();
    if (!token) return null;

    const [application, scheduling] = await Promise.all([
      getSeekerApplicationRichById(token, userId, id),
      getSchedulingRequestForApplication(token, id),
    ]);

    return application ? { application, scheduling } : null;
  },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await resolveApplicationDetail(id).catch(() => null);
  const title = detail?.application.listing?.title
    ? `Application — ${detail.application.listing.title}`
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
  rejected: "Not selected",
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
  rejected: "neutral",
  withdrawn: "neutral",
  expired: "neutral",
};

/**
 * Statuses a seeker may withdraw from — mirrors WITHDRAWABLE_STATUSES in
 * packages/db/src/queries/seekerApplicationsRich.ts. `offered` is excluded:
 * that has its own accept/decline path instead of a withdraw.
 */
const WITHDRAWABLE_STATUSES = new Set<string>(["applied", "reviewing", "saved_by_host"]);

interface ReturnTarget {
  readonly href: string;
  readonly label: string;
}

function returnTargetForStatus(status: string): ReturnTarget {
  switch (status) {
    case "offered":
      return { href: "/offered", label: "Back to offers" };
    case "accepted":
      return { href: "/accepted", label: "Back to accepted roles" };
    case "withdrawn":
      return { href: "/withdrawn", label: "Back to withdrawn applications" };
    case "not_selected":
    case "rejected":
      return { href: "/not-selected", label: "Back to not selected" };
    default:
      return { href: "/applied", label: "Back to applications" };
  }
}

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
  readonly reached: boolean;
}

function buildTimeline(application: RichSeekerApplication): TimelineStep[] {
  const isAwaitingOfferDecision = application.status === "offered";
  const submittedAt = formatDate(application.submittedAt);
  const reviewedAt = formatDate(application.reviewedAt);
  const decidedAt = formatDate(application.decidedAt);

  return [
    {
      key: "submitted",
      label: "Application submitted",
      description: "You applied to this opportunity.",
      at: submittedAt,
      reached: submittedAt !== null,
    },
    {
      key: "reviewed",
      label: "Reviewed by host",
      description: "The host opened and reviewed your application.",
      at: reviewedAt,
      reached: reviewedAt !== null,
    },
    {
      key: "decided",
      label: isAwaitingOfferDecision ? "Offer received" : "Decision made",
      description: isAwaitingOfferDecision
        ? "The host offered you this role. Review the details and respond when you’re ready."
        : "The host reached a final decision.",
      at: decidedAt,
      // The offered status proves receipt of an offer even when the legacy
      // transition did not persist a decision timestamp.
      reached: isAwaitingOfferDecision || decidedAt !== null,
    },
  ];
}

export default async function AppliedDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await resolveApplicationDetail(id);
  if (!detail) {
    notFound();
  }

  const { application, scheduling } = detail;
  const { listing, status } = application;
  const label = STATUS_LABEL[status] ?? "Applied";
  const variant = STATUS_VARIANT[status] ?? "neutral";
  const canWithdraw = WITHDRAWABLE_STATUSES.has(status);
  const returnTarget = returnTargetForStatus(status);
  const isDemoOfferedApplication = id === DEV_OFFERED_APPLICATION_ID;
  const timeline = buildTimeline(application);

  return (
    <BucketPage
      title={listing?.title ?? "Application"}
      description="Where your application stands."
      backHref={returnTarget.href}
      backLabel={returnTarget.label}
    >
      <article
        className={styles.summary}
        aria-labelledby="application-summary-title"
      >
        <div className={styles.frame}>
          {listing?.coverImageUrl ? (
            <Image
              className={styles.cover}
              src={listing.coverImageUrl}
              alt={`${listing.title} cover photo`}
              fill
              sizes="(max-width: 639px) calc(100vw - 4rem), 120px"
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
          <h2 id="application-summary-title" className={styles.summaryTitle}>
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
          {application.canStartConversation ? (
            <OpenConversationButton
              role="seeker"
              applicationId={application.id}
              label="Message host"
            />
          ) : null}
          {canWithdraw ? (
            <WithdrawButton applicationId={application.id} />
          ) : null}
          {status === "offered" ? (
            <OfferedActions
              applicationId={application.id}
              expiresAt={application.expiresAt}
              {...(listing ? { subject: listing.title } : {})}
              isDemoFixture={isDemoOfferedApplication}
            />
          ) : null}
        </div>
      </article>

      {scheduling.available && scheduling.request ? (
        <div className={styles.interview}>
          <InterviewScheduleCard
            request={scheduling.request}
            viewerRole="seeker"
          />
        </div>
      ) : null}

      <section className={styles.timeline}>
        <h3 className={styles.timelineHeading}>Status timeline</h3>
        <ol className={styles.steps}>
          {timeline.map((step) => {
            return (
              <li
                key={step.key}
                className={
                  step.reached
                    ? styles.step
                    : `${styles.step} ${styles.stepPending}`
                }
              >
                <span className={styles.dot} aria-hidden />
                <div className={styles.stepBody}>
                  <p className={styles.stepLabel}>{step.label}</p>
                  <p className={styles.stepDescription}>{step.description}</p>
                  <p className={styles.stepDate}>
                    {step.at ?? (step.reached ? "Date not recorded" : "Pending")}
                  </p>
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
