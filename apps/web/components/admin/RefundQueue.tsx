"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  type BadgeProps,
  Button,
  Icon,
  type IconKey,
  MetricCard,
  MetricGrid,
} from "@explore-and-earn/ui";

import {
  resolveRefundAction,
  type RefundDecision,
} from "../../app/actions/refunds";
import { formatAdminDate, humanizeToken } from "./status";
import styles from "./RefundQueue.module.css";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** One refund-request row, shaped by getRefundQueue (real columns only). */
export interface RefundQueueRowView {
  readonly id: string;
  readonly hostCompanyName: string | null;
  readonly purchaseType: string;
  readonly referenceId: string | null;
  readonly stripePaymentIntentId: string | null;
  readonly amountCents: number;
  readonly reason: string | null;
  readonly status: string;
  readonly adminNote: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

/** Refund stat counts from getRefundStats. */
export interface RefundStatsView {
  readonly requested: number;
  readonly refunded: number;
  readonly denied: number;
  readonly failed: number;
  readonly refundedCents: number;
}

type StatusLane = "all" | "requested" | "refunded" | "denied" | "failed";

/** A request is still actionable when it is awaiting a decision. */
function isOpen(status: string): boolean {
  return status === "requested";
}

/** Integer cents -> a clean USD string. */
function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** Human label for a purchase-type token. */
function purchaseLabel(type: string): string {
  switch (type) {
    case "subscription":
      return "Host subscription";
    case "announcement":
      return "Announcement";
    case "boost":
      return "Listing boost";
    default:
      return humanizeToken(type);
  }
}

/** Registry icon for a purchase type (registry keys only). */
function purchaseIcon(type: string): IconKey {
  switch (type) {
    case "announcement":
      return "nav.announcements";
    case "boost":
      return "status.boosted";
    default:
      return "benefit.pay";
  }
}

/** Map a refund status to a Badge variant. */
function statusVariant(status: string): BadgeVariant {
  if (status === "refunded") return "success";
  if (status === "denied") return "neutral";
  if (status === "failed") return "info";
  return "featured"; // requested — awaiting a decision; approved — in flight
}

/** Map a refund status to a registry icon key. */
function statusIcon(status: string): IconKey {
  if (status === "refunded") return "status.accepted";
  if (status === "denied") return "status.declined";
  if (status === "failed") return "system.warning";
  return "status.open"; // requested / approved
}

/**
 * Human label for a refund status. 'approved' is the transient state a row is
 * claimed into before the Stripe call, so it must read as in-flight — the
 * humanized token "Approved" would look like a finished, successful refund.
 */
function statusLabel(status: string): string {
  if (status === "approved") return "Processing";
  return humanizeToken(status);
}

/** A short, human "age" string from an ISO timestamp (queue triage signal). */
function requestAge(iso: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Admin Refund Queue — the review surface that closes the refund loop, inside
 * the admin (emerald) dark-glass OS.
 *
 * Each card is one host-filed refund request (real columns only: purchase type,
 * amount in cents, host company name, reason, status). An admin can APPROVE
 * (which fires the real Stripe refund in resolveRefundAction, then records the
 * outcome) or DENY (no money moves). A two-step confirm guards the irreversible
 * approve. The acting card shows a busy state via useTransition; router.refresh()
 * repaints from the server so the stat counts re-settle. Raw Clerk ids are NEVER
 * rendered — only the host company name from the query.
 */
export function RefundQueue({
  requests,
  stats,
}: {
  readonly requests: ReadonlyArray<RefundQueueRowView>;
  readonly stats: RefundStatsView;
}) {
  const router = useRouter();
  const [lane, setLane] = useState<StatusLane>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runDecision(
    request: RefundQueueRowView,
    decision: RefundDecision,
  ) {
    setError(null);
    setPendingId(request.id);
    setConfirmId(null);
    startTransition(async () => {
      const result = await resolveRefundAction(request.id, decision);
      setPendingId(null);
      if (!result.ok) {
        setError(
          result.error === "forbidden"
            ? "You are not authorized to resolve refunds."
            : result.error ?? "Something went wrong.",
        );
      } else {
        router.refresh();
      }
    });
  }

  const total = requests.length;
  const openCount = useMemo(
    () => requests.filter((r) => isOpen(r.status)).length,
    [requests],
  );

  const segments: ReadonlyArray<{
    readonly key: StatusLane;
    readonly label: string;
    readonly count: number;
  }> = [
    { key: "all", label: "All", count: total },
    { key: "requested", label: "Awaiting", count: stats.requested },
    { key: "refunded", label: "Refunded", count: stats.refunded },
    { key: "denied", label: "Denied", count: stats.denied },
    { key: "failed", label: "Failed", count: stats.failed },
  ];

  const visible = useMemo(() => {
    if (lane === "all") return requests;
    return requests.filter((r) => r.status === lane);
  }, [requests, lane]);

  return (
    <div className={styles.wrap}>
      <MetricGrid className={styles.metrics}>
        <MetricCard
          label="Awaiting review"
          value={stats.requested}
          trend={stats.requested > 0 ? "Needs a decision" : "Clear"}
          trendTone={stats.requested > 0 ? "down" : "up"}
        />
        <MetricCard
          label="Refunded"
          value={stats.refunded}
          trend={formatCents(stats.refundedCents)}
          trendTone="neutral"
        />
        <MetricCard
          label="Denied"
          value={stats.denied}
          trend="No refund"
          trendTone="up"
        />
        <MetricCard
          label="Failed"
          value={stats.failed}
          trend={stats.failed > 0 ? "Stripe error" : "None"}
          trendTone={stats.failed > 0 ? "down" : "neutral"}
        />
      </MetricGrid>

      {total > 0 ? (
        <div
          className={styles.toolbar}
          role="group"
          aria-label="Filter refunds by status"
        >
          <span className={styles.toolbarIcon} aria-hidden="true">
            <Icon name="action.filter" size={16} />
          </span>
          <div className={styles.segments}>
            {segments.map((seg) => (
              <button
                key={seg.key}
                type="button"
                className={`${styles.segment} ${lane === seg.key ? styles.segmentActive : ""}`.trim()}
                aria-pressed={lane === seg.key}
                onClick={() => setLane(seg.key)}
              >
                <span className={styles.segmentLabel}>{seg.label}</span>
                <span className={styles.segmentCount}>{seg.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          <Icon aria-hidden name="system.error" size={16} className={styles.errorIcon} />
          {error}
        </p>
      ) : null}

      {total === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon aria-hidden name="system.success" size={24} />
          </span>
          <h3 className={styles.emptyTitle}>No refund requests</h3>
          <p className={styles.emptySub}>
            When a host requests a refund on a subscription, announcement, or
            boost, it lands here for review. A clear queue is a healthy sign.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon aria-hidden name="system.success" size={24} />
          </span>
          <h3 className={styles.emptyTitle}>Nothing in this lane</h3>
          <p className={styles.emptySub}>
            No requests match the <strong>{humanizeToken(lane)}</strong> filter.
            Widen the view to see the rest of the queue.
          </p>
          <Button variant="secondary" icon="action.close" onClick={() => setLane("all")}>
            Clear filter
          </Button>
        </div>
      ) : (
        <>
          <p className={styles.resultLine} role="status" aria-live="polite">
            {lane === "all" ? (
              <>
                <strong>{total}</strong> requests · {openCount} awaiting review
              </>
            ) : (
              <>
                Showing <strong>{visible.length}</strong> of {total}
              </>
            )}
          </p>

          <div className={styles.grid} role="list">
            {visible.map((request) => {
              const busy = isPending && pendingId === request.id;
              const open = isOpen(request.status);
              const confirming = confirmId === request.id;
              return (
                <article
                  key={request.id}
                  role="listitem"
                  className={styles.card}
                  data-resolved={open ? undefined : "true"}
                >
                  <span className={styles.edge} aria-hidden="true" />

                  <div className={styles.cardHead}>
                    <span className={styles.amount}>
                      <Icon
                        aria-hidden
                        name="benefit.pay"
                        size={20}
                        className={styles.amountIcon}
                      />
                      {formatCents(request.amountCents)}
                    </span>
                    <Badge
                      label={statusLabel(request.status)}
                      variant={statusVariant(request.status)}
                      icon={statusIcon(request.status)}
                    />
                  </div>

                  <div className={styles.purchase}>
                    <span className={styles.purchaseIcon} aria-hidden="true">
                      <Icon name={purchaseIcon(request.purchaseType)} size={20} />
                    </span>
                    <span className={styles.purchaseText}>
                      <span className={styles.purchaseTitle}>
                        {purchaseLabel(request.purchaseType)}
                      </span>
                      <span className={styles.purchaseMeta}>
                        {request.hostCompanyName ?? "Unknown host"}
                        {request.stripePaymentIntentId ? (
                          <>
                            <span className={styles.metaDot} aria-hidden="true" />
                            Stripe charge on record
                          </>
                        ) : (
                          <>
                            <span className={styles.metaDot} aria-hidden="true" />
                            No Stripe charge
                          </>
                        )}
                      </span>
                    </span>
                  </div>

                  {request.reason ? (
                    <p className={styles.reason}>“{request.reason}”</p>
                  ) : (
                    <p className={styles.reasonEmpty}>No reason provided.</p>
                  )}

                  <div className={styles.cardFootMeta}>
                    <span className={styles.age}>
                      <Icon name="status.begins" size={16} aria-hidden />
                      <span>{requestAge(request.createdAt)}</span>
                      <span className={styles.date}>
                        {formatAdminDate(request.createdAt)}
                      </span>
                    </span>
                  </div>

                  {open ? (
                    confirming ? (
                      <div className={styles.confirm} role="group" aria-label="Confirm approval">
                        <p className={styles.confirmText}>
                          Approve and issue a{" "}
                          <strong>{formatCents(request.amountCents)}</strong> Stripe
                          refund? This cannot be undone.
                        </p>
                        <div className={styles.actions}>
                          <Button
                            variant="ghost"
                            icon="action.close"
                            disabled={busy}
                            onClick={() => setConfirmId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            icon="status.accepted"
                            disabled={busy}
                            data-tone="confirm"
                            aria-label={`Confirm refund of ${formatCents(request.amountCents)}`}
                            onClick={() => runDecision(request, "approve")}
                          >
                            {busy ? "Refunding…" : "Confirm refund"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.actions}>
                        <Button
                          variant="ghost"
                          icon="status.declined"
                          disabled={busy}
                          data-tone="deny"
                          aria-label={`Deny refund request from ${request.hostCompanyName ?? "host"}`}
                          onClick={() => runDecision(request, "deny")}
                        >
                          Deny
                        </Button>
                        <Button
                          variant="primary"
                          icon="status.accepted"
                          disabled={busy}
                          data-tone="approve"
                          aria-label={`Approve and refund ${formatCents(request.amountCents)}`}
                          onClick={() => {
                            setError(null);
                            setConfirmId(request.id);
                          }}
                        >
                          Approve refund
                        </Button>
                      </div>
                    )
                  ) : (
                    <div className={styles.resolvedFoot}>
                      <Icon
                        aria-hidden
                        name={statusIcon(request.status)}
                        size={16}
                        className={styles.resolvedIcon}
                      />
                      <span>
                        {humanizeToken(request.status)}
                        {request.resolvedAt
                          ? ` · ${formatAdminDate(request.resolvedAt)}`
                          : ""}
                      </span>
                    </div>
                  )}

                  {request.adminNote && !open ? (
                    <p className={styles.adminNote}>{request.adminNote}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
