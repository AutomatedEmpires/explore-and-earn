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
  holdListingAction,
  rejectListingAction,
} from "../../app/actions/admin";
import { matchesAdminQuery } from "./adminSearch";
import { ConfirmAction } from "./ConfirmAction";
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

const SORTS = [
  { id: "priority", label: "Priority" },
  { id: "newest", label: "Newest" },
  { id: "title", label: "A–Z" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

/** Moderation urgency rank — what a moderator should see first. */
function priorityRank(status: string): number {
  switch (status) {
    case "under_review":
      return 0;
    case "draft":
      return 1;
    case "paused":
      return 2;
    case "live":
      return 3;
    default:
      return 4;
  }
}

/** Category lane -> registry icon + a tint hook for the cover mat. */
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
      return "var(--color-cta)";
    case "remote":
      return "var(--status-match-fg)";
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

type SignalTone = "ok" | "warn" | "neutral";

interface RowSignal {
  readonly label: string;
  readonly tone: SignalTone;
  readonly icon: IconKey;
}

/**
 * Honest, scannable moderation signals derived ONLY from the row's real
 * moderation fields (status + publish state). The row query exposes no
 * housing/meals/pay disclosure, so we never claim a triad here — the full
 * disclosure checklist lives on the review detail page where that data exists.
 */
function rowSignals(status: string, published: boolean): ReadonlyArray<RowSignal> {
  const signals: RowSignal[] = [];

  switch (status) {
    case "under_review":
      signals.push({
        label: "Awaiting decision",
        tone: "warn",
        icon: "action.view",
      });
      break;
    case "draft":
      signals.push({
        label: "Host draft",
        tone: "neutral",
        icon: "status.draft",
      });
      break;
    case "live":
      signals.push({ label: "Cleared", tone: "ok", icon: "system.success" });
      break;
    case "paused":
      signals.push({ label: "Paused", tone: "neutral", icon: "status.paused" });
      break;
    case "closed":
    case "archived":
      signals.push({
        label: "Off-market",
        tone: "neutral",
        icon: "status.archived",
      });
      break;
    default:
      break;
  }

  signals.push(
    published
      ? { label: "Indexed", tone: "ok", icon: "status.open" }
      : { label: "Not published", tone: "warn", icon: "system.warning" },
  );

  return signals;
}

export function AdminListingsTable({
  initialQuery,
  listings,
}: {
  readonly initialQuery: string;
  readonly listings: ReadonlyArray<AdminListingRowView>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("priority");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasQuery = initialQuery.trim().length > 0;

  const visible = useMemo(() => {
    const filtered = listings.filter((listing) => {
      if (filter !== "all" && listing.status !== filter) return false;
      return matchesAdminQuery(initialQuery, [
        listing.title || "Untitled listing",
        listing.hostCompanyName,
        listing.category,
        humanizeToken(listing.status),
      ]);
    });

    const sorted = [...filtered];
    if (sort === "priority") {
      sorted.sort((a, b) => {
        const rank = priorityRank(a.status) - priorityRank(b.status);
        if (rank !== 0) return rank;
        // Within a rank, newest published first (nulls last).
        return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
      });
    } else if (sort === "newest") {
      sorted.sort((a, b) =>
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
      );
    } else {
      sorted.sort((a, b) =>
        (a.title || "Untitled").localeCompare(b.title || "Untitled"),
      );
    }
    return sorted;
  }, [filter, initialQuery, listings, sort]);

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
      } else {
        // Re-render the route so the moderated row reflects its new status
        // immediately (the server action's revalidatePath alone won't repaint
        // this client list within the same transition).
        router.refresh();
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
        />
        <MetricCard
          label="Live"
          value={counts.live}
          trend="Published"
          trendTone="up"
        />
        <MetricCard
          label="Under review"
          value={counts.underReview}
          trend={counts.underReview > 0 ? "Needs eyes" : "Clear"}
          trendTone={counts.underReview > 0 ? "neutral" : "up"}
        />
        <MetricCard
          label="Drafts"
          value={counts.draft}
          trend="Incomplete"
          trendTone="down"
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
        <span className={styles.count} role="status" aria-live="polite">
          {hasQuery || filter !== "all"
            ? `${visible.length} of ${listings.length} listings on this page`
            : `${visible.length} ${visible.length === 1 ? "listing" : "listings"} on this page`}
        </span>
      </div>

      <div className={styles.triageBar}>
        <div
          className={styles.sorts}
          role="group"
          aria-label="Sort listings"
        >
          <span className={styles.sortIcon} aria-hidden="true">
            <Icon name="action.sort" size={16} />
          </span>
          {SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={styles.sort}
              aria-pressed={sort === option.id}
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <Icon
              name={hasQuery ? "action.search" : "system.success"}
              size={24}
            />
          </span>
          <p className={styles.emptyTitle}>
            {hasQuery || filter !== "all"
              ? "No matching listings on this page"
              : "No listings on this page"}
          </p>
          <p className={styles.emptyBody}>
            {hasQuery && filter !== "all"
              ? "No listings on this page match these filters."
              : hasQuery
              ? "No listings on this page match this search."
              : filter !== "all"
                ? "No listings on this page match this status filter."
                : "No listings are loaded on this page."}
          </p>
          {filter !== "all" || hasQuery ? (
            <Button
              variant="secondary"
              onClick={() => {
                setFilter("all");
                if (hasQuery) router.push("/listings");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className={styles.rows}>
          {visible.map((listing) => {
            const busy = isPending && pendingId === listing.id;
            const review = isReviewState(listing.status);
            const isAwaitingReview = listing.status === "under_review";
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
                  <ul className={styles.tags} aria-label="Moderation signals">
                    {rowSignals(listing.status, published).map((signal) => (
                      <li
                        key={signal.label}
                        className={`${styles.tag} ${styles[`tag_${signal.tone}`]}`}
                      >
                        <Icon name={signal.icon} size={16} />
                        {signal.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={styles.actionsStack}>
                  <div className={styles.figure}>
                    <span className={styles.figureValue}>
                      {published
                        ? formatAdminDate(listing.publishedAt)
                        : humanizeToken(listing.status)}
                    </span>
                    <span className={styles.figureLabel}>
                      {published ? "Published" : "Current stage"}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    {/* Approve stays one click on purpose. It is the throughput
                        verb of this queue, and it is the reversible one: a
                        listing approved by mistake can be pulled straight back
                        with Hold or Reject below. Confirming it would tax the
                        common path to guard the cheapest mistake. */}
                    {isAwaitingReview ? (
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
                    ) : null}
                    {isAwaitingReview ? (
                      <div className={styles.actionsSecondary}>
                        <ConfirmAction
                          label="Hold"
                          confirmLabel="Confirm hold"
                          question="Hold this listing? It leaves the seeker feed immediately and goes back to the host as a draft for them to fix and republish. Nothing notifies them that it moved."
                          subject={listing.title || "Untitled listing"}
                          triggerVariant="secondary"
                          busy={busy}
                          onConfirm={() =>
                            runAction(listing.id, () =>
                              holdListingAction(listing.id),
                            )
                          }
                        />
                        <ConfirmAction
                          label="Reject"
                          confirmLabel="Confirm rejection"
                          question="Reject this listing? It closes and leaves the marketplace immediately. No reason is recorded anywhere and the host is not notified."
                          subject={listing.title || "Untitled listing"}
                          busy={busy}
                          onConfirm={() =>
                            runAction(listing.id, () =>
                              rejectListingAction(listing.id),
                            )
                          }
                        />
                      </div>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() => router.push(`/listings/${listing.id}`)}
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
