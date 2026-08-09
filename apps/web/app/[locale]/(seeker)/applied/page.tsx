import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { auth } from "@clerk/nextjs/server";
import { NOT_STATED_LABEL } from "@explore-and-earn/contracts";
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

import { devFallback } from "../../../../lib/devBench/fallback";
import { BucketPage } from "../../../../components/seeker";
import { CATEGORY_ICON, EmptyState } from "../../../../components/discovery";
import { WithdrawButton } from "./WithdrawButton";
import styles from "./applied.module.css";

export const metadata: Metadata = {
  title: "Applied",
};

// Applications are per-seeker and change as they apply, so never statically cache.
export const dynamic = "force-dynamic";

const SIGN_IN_MESSAGE =
  "Once you're signed in, every application you submit will show up here.";

/** Statuses still in flight. Everything else is treated as closed history. */
const ACTIVE_STATUSES = new Set<string>([
  "applied",
  "reviewing",
  "saved_by_host",
  "offered",
]);

/**
 * Statuses a seeker may withdraw from — mirrors WITHDRAWABLE_STATUSES in
 * packages/db/src/queries/seekerApplicationsRich.ts. `offered` is excluded:
 * that has its own accept/decline path instead of a withdraw.
 */
const WITHDRAWABLE_STATUSES = new Set<string>(["applied", "reviewing", "saved_by_host"]);

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

function benefitText(info: {
  readonly provision: string;
  readonly summary?: string;
}): string {
  if (info.provision === "not_stated") return NOT_STATED_LABEL;
  if (info.summary) return info.summary;
  if (info.provision === "provided") return "Included";
  if (info.provision === "partial") return "Partial";
  return "Not included";
}

function formatSubmitted(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ApplicationRow({
  application,
}: {
  application: RichSeekerApplication;
}) {
  const { listing, status } = application;
  const label = STATUS_LABEL[status] ?? "Applied";
  const variant = STATUS_VARIANT[status] ?? "neutral";
  const submitted = formatSubmitted(application.submittedAt);
  const canWithdraw = WITHDRAWABLE_STATUSES.has(status);

  if (!listing) {
    return (
      <article className={styles.card}>
        <div className={styles.body}>
          <div className={styles.statusRow}>
            <Badge label={label} variant={variant} />
          </div>
          <p className={styles.title}>Listing no longer available</p>
          {canWithdraw ? (
            <WithdrawButton applicationId={application.id} />
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className={styles.card}>
      <div className={styles.frame}>
        {listing.coverImageUrl ? (
          <Image
            className={styles.cover}
            src={listing.coverImageUrl}
            alt={`${listing.title} cover photo`}
            fill
            sizes="80px"
          />
        ) : (
          <span className={styles.coverFallback}>
            <Icon
              name={CATEGORY_ICON[listing.category]}
              size={24}
              aria-hidden
            />
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.statusRow}>
          <Badge label={label} variant={variant} />
          {submitted ? (
            <span className={styles.submitted}>Submitted {submitted}</span>
          ) : null}
        </div>

        <h3 className={styles.title}>
          <Link
            className={styles.titleLink}
            href={`/applied/${application.id}`}
          >
            {listing.title}
          </Link>
        </h3>

        <div className={styles.hostRow}>
          <span className={styles.hostName}>{listing.host.name}</span>
          {listing.host.verified ? <VerifiedHostBadge /> : null}
        </div>

        <dl className={styles.triad}>
          <div className={styles.triadItem}>
            <Icon name="benefit.housing" size={16} aria-hidden />
            <dt className={styles.triadLabel}>Housing</dt>
            <dd className={styles.triadValue}>
              {benefitText(listing.benefits.housing)}
            </dd>
          </div>
          <div className={styles.triadItem}>
            <Icon name="benefit.meals" size={16} aria-hidden />
            <dt className={styles.triadLabel}>Meals</dt>
            <dd className={styles.triadValue}>
              {benefitText(listing.benefits.meals)}
            </dd>
          </div>
          <div className={styles.triadItem}>
            <Icon name="benefit.pay" size={16} aria-hidden />
            <dt className={styles.triadLabel}>Pay</dt>
            <dd className={styles.triadValue}>
              {benefitText(listing.benefits.pay)}
            </dd>
          </div>
        </dl>

        <div className={styles.actions}>
          <Link
            className={styles.detailLink}
            href={`/applied/${application.id}`}
          >
            View details
          </Link>
          {canWithdraw ? (
            <WithdrawButton applicationId={application.id} />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ApplicationGroup({
  title,
  applications,
  emptyMessage,
}: {
  title: string;
  applications: RichSeekerApplication[];
  emptyMessage: string;
}) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupHeading}>
        {title}
        <span className={styles.groupCount}>{applications.length}</span>
      </h2>
      {applications.length === 0 ? (
        <p className={styles.groupEmpty}>{emptyMessage}</p>
      ) : (
        <div className={styles.grid}>
          {applications.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function AppliedPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Applied"
        description="Track the applications you've submitted."
      >
        <EmptyState
          title="Sign in to see your applications"
          message={SIGN_IN_MESSAGE}
        />
      </BucketPage>
    );
  }

  const applications = await devFallback(
    getSeekerApplicationsRich(token, userId),
    [] as RichSeekerApplication[],
  );
  const active = applications.filter((a) => ACTIVE_STATUSES.has(a.status));
  const closed = applications.filter((a) => !ACTIVE_STATUSES.has(a.status));

  return (
    <BucketPage
      title="Applied"
      description="Track the applications you've submitted."
    >
      {applications.length === 0 ? (
        <EmptyState
          illustration="empty.applications"
          title="No applications yet"
          message="When you apply to an opportunity, it'll show up here."
          actionLabel="Find your next season"
          actionHref="/seek"
        />
      ) : (
        <div className={styles.groups}>
          <ApplicationGroup
            title="Active"
            applications={active}
            emptyMessage="No active applications right now."
          />
          <ApplicationGroup
            title="Closed"
            applications={closed}
            emptyMessage="Nothing closed out yet."
          />
        </div>
      )}
    </BucketPage>
  );
}
