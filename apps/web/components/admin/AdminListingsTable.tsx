"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Icon,
  MetricCard,
  MetricGrid,
  type IconKey,
} from "@explore-and-earn/ui";

import {
  approveListingAction,
  rejectListingAction,
} from "../../app/actions/admin";
import { formatAdminDate, humanizeToken, listingStatusVariant } from "./status";
import styles from "./AdminListingsTable.module.css";

export interface AdminListingRowView {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly status: string;
  readonly publishedAt: string | null;
  readonly hostCompanyName: string;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "under_review", label: "Under Review" },
  { id: "live", label: "Live" },
  { id: "draft", label: "Draft" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

/** Category lane -> Streamline registry icon + a tint hook for the cover mat. */
const CATEGORY_ICON: Record<string, IconKey> = {
  farm: "category.farm",
  maritime: "category.maritime",
  remote: "category.remote",
  seasonal: "category.seasonal",
  mix: "category.mix",
};

function categoryIcon(category: string): IconKey {
  return CATEGORY_ICON[category] ?? "category.mix";
}

/** Per-lane accent for the cover plate (semantic status tokens only). */
function coverAccent(category: string): string {
  switch (category) {
    case "farm":
      return "var(--status-success-fg)";
    case "maritime":
      return "var(--status-match-fg)";
    case "remote":
      return "var(--status-featured-fg)";
    case "seasonal":
      return "var(--status-boosted-fg)";
    default:
      return "var(--color-cta)";
  }
}

/** Status that needs a moderator's eye gets the accent edge + danger figure. */
function isReviewState(status: string): boolean {
  return status === "under_review" || status === "draft";
}

export function AdminListingsTable({
  listings,
}: {
  readonly listings: ReadonlyArray<AdminListingRowView>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterId>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      filter === "all"
        ? listings
        : listings.filter((listing) => listing.status === filter),
    [filter, listings],
  );

  const counts = useMemo(() => {
    let live = 0;
    let underReview = 0;
    let draft = 0;
    for (const listing of listings) {
      if (listing.status === "live") live += 1;
      else if (listing.status === "under_review") underReview += 1;
      else if (listing.status === "draft") draft += 1;
    }
    return { total: listings.length, live, underReview, draft };
  }, [listings]);

  function runAction(
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await action();
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className={styles.wrap}>
      <MetricGrid className={styles.metrics}>
        <MetricCard
          label="Listings"
          value={counts.total}
          trend="Catalog"
          trendTone="neutral"
          spark={[34, 52, 41, 63, 58, 74, 69]}
        />
        <MetricCard
          label="Live"
          value={counts.live}
          trend="Published"
          trendTone="up"
          spark={[40, 48, 55, 60, 66, 72, 81]}
        />
        <MetricCard
          label="Under review"
          value={counts.underReview}
          trend={counts.underReview > 0 ? "Needs eyes" : "Clear"}
          trendTone={counts.underReview > 0 ? "neutral" : "up"}
          spark={[22, 38, 30, 46, 34, 52, 44]}
        />
        <MetricCard
          label="Drafts"
          value={counts.draft}
          trend="Incomplete"
          trendTone="down"
          spark={[18, 26, 22, 30, 24, 33, 28]}
        />
      </MetricGrid>

      <div className={styles.toolbar}>
        <div
          className={styles.tabs}
          role="group"
          aria-label="Filter listings by status"
        >
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={styles.tab}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className={styles.count} aria-live="polite">
          {visible.length} {visible.length === 1 ? "listing" : "listings"}
        </span>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <Icon name="system.success" size={24} />
          </span>
          <p className={styles.emptyTitle}>The queue is clear</p>
          <p className={styles.emptyBody}>
            No listings in this view. Switch filters to see other states.
          </p>
        </div>
      ) : (
        <ul className={styles.rows}>
          {visible.map((listing) => {
            const busy = isPending && pendingId === listing.id;
            const review = isReviewState(listing.status);
            const published = listing.publishedAt !== null;
            const category = humanizeToken(listing.category);
            return (
              <li
                key={listing.id}
                className={`${styles.row} ${review ? styles.rowReview : ""}`.trim()}
              >
                <div
                  className={styles.cover}
                  style={
                    {
                      "--cover-accent": coverAccent(listing.category),
                    } as CSSProperties
                  }
                >
                  <span className={styles.coverGrain} aria-hidden="true" />
                  <span className={styles.coverIcon}>
                    <Icon
                      name={categoryIcon(listing.category)}
                      size={24}
                      title={`${category} lane`}
                    />
                  </span>
                  <span className={styles.coverCat}>{category}</span>
                </div>

                <div className={styles.body}>
                  <div className={styles.bodyTop}>
                    <Badge
                      label={humanizeToken(listing.status)}
                      variant={listingStatusVariant(listing.status)}
                    />
                  </div>
                  <h3 className={styles.title}>{listing.title || "Untitled listing"}</h3>
                  <p className={styles.meta}>
                    <span className={styles.host}>{listing.hostCompanyName}</span>
                    {" · "}
                    {category} lane
                    {" · "}
                    {published
                      ? `Published ${formatAdminDate(listing.publishedAt)}`
                      : "Not yet published"}
                  </p>
                  <div className={styles.tags}>
                    <span className={styles.tag}>Housing · Meals · Pay</span>
                    <span className={styles.tag}>
                      {published ? "Live record" : "Pre-publish"}
                    </span>
                  </div>
                </div>

                <div className={styles.actionsStack}>
                  <div className={styles.figure}>
                    <span
                      className={`${styles.figureValue} ${
                        published ? "" : styles.figureValueMissing
                      }`.trim()}
                    >
                      {published ? formatAdminDate(listing.publishedAt) : "Draft"}
                    </span>
                    <span className={styles.figureLabel}>
                      {published ? "Published" : "Pay range pending"}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        runAction(listing.id, () =>
                          approveListingAction(listing.id),
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        runAction(listing.id, () =>
                          rejectListingAction(listing.id),
                        )
                      }
                    >
                      Reject
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        router.push(`/admin/listings/${listing.id}`)
                      }
                    >
                      Review
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
