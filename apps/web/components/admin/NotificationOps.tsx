"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, MetricCard, MetricGrid } from "@explore-and-earn/ui";

import {
  cancelDeliveryAction,
  requeueDeliveryAction,
} from "../../app/actions/adminNotifications";
import { ConfirmAction } from "./ConfirmAction";
import { formatAdminDate, humanizeToken } from "./status";
import styles from "./NotificationOps.module.css";

/** Delivery row view shaped by adminListDeliveries (real columns only). */
export interface NotificationDeliveryRowView {
  readonly id: string;
  readonly recipientClerkUserId: string;
  readonly channel: string;
  readonly notificationType: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly failureClass: string | null;
  readonly failureDetail: string | null;
  readonly suppressionReason: string | null;
  readonly nextAttemptAt: string;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
}

export interface NotificationOpsProps {
  /** Active NOTIFICATION_ENGINE_STAGE (resolved server-side). */
  readonly stage: string;
  /** True when the engine tables are missing (migration 065 unapplied). */
  readonly ledgerAvailable: boolean;
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly recent: readonly NotificationDeliveryRowView[];
  readonly deadLetters: readonly NotificationDeliveryRowView[];
  readonly suppressions: ReadonlyArray<{
    readonly id: string;
    readonly email: string;
    readonly reason: string;
    readonly source: string | null;
    readonly createdAt: string;
  }>;
  readonly digestQueue: { readonly dailyQueued: number; readonly weeklyQueued: number };
  readonly pushSubscriptions: { readonly active: number; readonly revoked: number };
}

function stageBadgeVariant(stage: string): "success" | "info" | "neutral" {
  if (stage === "enabled") return "success";
  if (stage === "disabled") return "neutral";
  return "info";
}

function isTerminalFailure(status: string): boolean {
  return status === "dead_letter" || status === "failed_terminal";
}

function isOutcomeUnknownInvite(row: NotificationDeliveryRowView): boolean {
  return (
    row.notificationType === "invite_received" &&
    row.status === "dead_letter" &&
    row.failureClass === "outcome_unknown"
  );
}

/**
 * An outcome-unknown invitation dead letter is immutable: the provider may
 * have accepted it before its response was lost. Known-unsent terminal rows
 * remain recoverable by an operator.
 */
function isRequeueable(row: NotificationDeliveryRowView): boolean {
  return isTerminalFailure(row.status) && !isOutcomeUnknownInvite(row);
}

/** Statuses the cancel verb accepts (mirrors adminCancelDelivery's WHERE). */
function isCancellable(status: string): boolean {
  return status === "pending" || status === "deferred" || status === "failed_retryable";
}

/**
 * How a row reads out loud in a confirmation. A delivery id identifies nothing
 * to the person deciding, so the confirmation names what the delivery IS and
 * who it is aimed at — the two facts that make "twice" or "never" mean
 * something.
 */
function deliverySubject(row: NotificationDeliveryRowView): string {
  return `${humanizeToken(row.notificationType)} to ${row.recipientClerkUserId}`;
}

function DeliveryTable({
  rows,
  emptyText,
  onRequeue,
  onCancel,
  pendingId,
}: {
  readonly rows: readonly NotificationDeliveryRowView[];
  readonly emptyText: string;
  readonly onRequeue: (id: string) => void;
  readonly onCancel: (id: string) => void;
  readonly pendingId: string | null;
}) {
  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Created</th>
            <th scope="col">Type</th>
            <th scope="col">Channel</th>
            <th scope="col">Recipient</th>
            <th scope="col">Status</th>
            <th scope="col">Attempts</th>
            <th scope="col">Detail</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatAdminDate(row.createdAt)}</td>
              <td>{humanizeToken(row.notificationType)}</td>
              <td>{humanizeToken(row.channel)}</td>
              <td className={styles.mono}>{row.recipientClerkUserId}</td>
              <td className={isTerminalFailure(row.status) ? styles.failed : undefined}>
                {humanizeToken(row.status)}
              </td>
              <td className={styles.mono}>{row.attemptCount}</td>
              <td
                className={`${styles.detail} ${row.suppressionReason ? styles.suppressedReason : ""}`}
                title={row.failureDetail ?? row.suppressionReason ?? undefined}
              >
                {row.failureDetail ?? row.suppressionReason ?? "—"}
              </td>
              <td>
                <span className={styles.actionsCell}>
                  {isRequeueable(row) ? (
                    <ConfirmAction
                      label="Requeue"
                      question="Requeue this delivery? If the original send actually succeeded and was only recorded as failed, the recipient gets it twice."
                      confirmLabel="Confirm requeue"
                      subject={deliverySubject(row)}
                      tone="neutral"
                      disabled={pendingId !== null}
                      busy={pendingId === row.id}
                      onConfirm={() => onRequeue(row.id)}
                    />
                  ) : null}
                  {isOutcomeUnknownInvite(row) ? (
                    <span title="Invitation delivery outcomes cannot be replayed safely.">
                      Outcome locked
                    </span>
                  ) : null}
                  {isCancellable(row.status) ? (
                    <ConfirmAction
                      label="Cancel"
                      question="Cancel this delivery? It will never be sent, and the notification it carried is not regenerated."
                      confirmLabel="Confirm cancel"
                      subject={deliverySubject(row)}
                      tone="danger"
                      disabled={pendingId !== null}
                      busy={pendingId === row.id}
                      onConfirm={() => onCancel(row.id)}
                    />
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Operational console over the notification delivery ledger: stage banner,
 * status counts, recent + dead-letter deliveries with single-row requeue and
 * cancel verbs, email suppressions, digest queue, and push-subscription
 * health. Read-only apart from the two narrow repair verbs — this surface
 * deliberately has no way to send anything.
 */
export function NotificationOps(props: NotificationOpsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function run(id: string, verb: "requeue" | "cancel") {
    setResult(null);
    setPendingId(id);
    startTransition(async () => {
      const outcome =
        verb === "requeue"
          ? await requeueDeliveryAction(id)
          : await cancelDeliveryAction(id);
      setPendingId(null);
      if (outcome.ok) {
        setResult({ ok: true, text: verb === "requeue" ? "Delivery requeued." : "Delivery cancelled." });
        router.refresh();
      } else {
        setResult({
          ok: false,
          text:
            outcome.error === "not_requeueable" || outcome.error === "not_cancellable"
              ? "That delivery changed state — refresh and retry."
              : "Action failed.",
        });
      }
    });
  }

  const busy = isPending ? pendingId : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.stageLine}>
        <Badge variant={stageBadgeVariant(props.stage)} label={humanizeToken(props.stage)} />
        <span>
          Engine stage (NOTIFICATION_ENGINE_STAGE). Stage changes are a Vercel
          env update + redeploy — see docs/runbooks/notification-engine.md.
        </span>
      </div>

      {!props.ledgerAvailable ? (
        <p className={styles.empty}>
          The delivery ledger could not be read. Most commonly migration 065
          has not been applied to this database yet (the engine is safely
          inert while the stage is disabled) — but a transient read failure
          looks identical here, so check the server logs before concluding.
        </p>
      ) : (
        <>
          <MetricGrid>
            <MetricCard label="Pending" value={String(props.statusCounts.pending ?? 0)} />
            <MetricCard label="Deferred" value={String(props.statusCounts.deferred ?? 0)} />
            <MetricCard label="Delivered" value={String(props.statusCounts.delivered ?? 0)} />
            <MetricCard label="Suppressed" value={String(props.statusCounts.suppressed ?? 0)} />
            <MetricCard label="Retryable" value={String(props.statusCounts.failed_retryable ?? 0)} />
            <MetricCard label="Dead letter" value={String(props.statusCounts.dead_letter ?? 0)} />
          </MetricGrid>

          {result ? (
            <p
              className={`${styles.resultLine} ${result.ok ? "" : styles.resultError}`}
              role="status"
              aria-live="polite"
            >
              {result.text}
            </p>
          ) : null}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Dead letters &amp; terminal failures</h2>
            <DeliveryTable
              rows={props.deadLetters}
              emptyText="No dead-lettered or terminally failed deliveries."
              onRequeue={(id) => run(id, "requeue")}
              onCancel={(id) => run(id, "cancel")}
              pendingId={busy}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent deliveries</h2>
            <DeliveryTable
              rows={props.recent}
              emptyText="No deliveries recorded yet."
              onRequeue={(id) => run(id, "requeue")}
              onCancel={(id) => run(id, "cancel")}
              pendingId={busy}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Email suppressions</h2>
            {props.suppressions.length === 0 ? (
              <p className={styles.empty}>No suppressed addresses.</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Email</th>
                      <th scope="col">Reason</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.suppressions.map((s) => (
                      <tr key={s.id}>
                        <td>{formatAdminDate(s.createdAt)}</td>
                        <td className={styles.mono}>{s.email}</td>
                        <td>{humanizeToken(s.reason)}</td>
                        <td>{s.source ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Queues &amp; channels</h2>
            <MetricGrid>
              <MetricCard label="Daily digest queued" value={String(props.digestQueue.dailyQueued)} />
              <MetricCard label="Weekly digest queued" value={String(props.digestQueue.weeklyQueued)} />
              <MetricCard label="Push subs active" value={String(props.pushSubscriptions.active)} />
              <MetricCard label="Push subs revoked" value={String(props.pushSubscriptions.revoked)} />
            </MetricGrid>
          </section>
        </>
      )}
    </div>
  );
}
