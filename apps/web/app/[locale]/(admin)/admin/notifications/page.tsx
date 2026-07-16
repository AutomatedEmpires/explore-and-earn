import type { Metadata } from "next";
import {
  adminDeliveryStatusCounts,
  adminDigestQueueSummary,
  adminListDeliveries,
  adminListEmailSuppressions,
  adminPushSubscriptionSummary,
  type AdminDeliveryRow,
} from "@explore-and-earn/db";

import { NotificationOps, type NotificationDeliveryRowView } from "../../../../../components/admin";
import { resolveEngineStage } from "../../../../../services/notifications/stage";
import styles from "../../shared.module.css";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

function toRowView(row: AdminDeliveryRow): NotificationDeliveryRowView {
  return {
    id: row.id,
    recipientClerkUserId: row.recipient_clerk_user_id,
    channel: row.channel,
    notificationType: row.notification_type,
    status: row.status,
    attemptCount: row.attempt_count,
    failureClass: row.failure_class,
    failureDetail: row.failure_detail,
    suppressionReason: row.suppression_reason,
    nextAttemptAt: row.next_attempt_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}

/**
 * Notification-engine ops console. Resilient before migration 065 exists:
 * any ledger read failure renders the "tables not present" state instead of
 * crashing the admin surface (the engine itself is a stage-gated no-op then).
 */
export default async function AdminNotificationsPage() {
  const stage = resolveEngineStage();

  let ledgerAvailable = true;
  let statusCounts: Record<string, number> = {};
  let recent: NotificationDeliveryRowView[] = [];
  let deadLetters: NotificationDeliveryRowView[] = [];
  let suppressions: Array<{
    id: string;
    email: string;
    reason: string;
    source: string | null;
    createdAt: string;
  }> = [];
  let digestQueue = { dailyQueued: 0, weeklyQueued: 0 };
  let pushSubscriptions = { active: 0, revoked: 0 };

  try {
    const [counts, recentRows, deadRows, terminalRows, suppressionRows, digests, push] =
      await Promise.all([
        adminDeliveryStatusCounts(),
        adminListDeliveries({ limit: 50 }),
        adminListDeliveries({ status: "dead_letter", limit: 50 }),
        adminListDeliveries({ status: "failed_terminal", limit: 50 }),
        adminListEmailSuppressions(50),
        adminDigestQueueSummary(),
        adminPushSubscriptionSummary(),
      ]);
    statusCounts = counts;
    recent = recentRows.map(toRowView);
    deadLetters = [...deadRows, ...terminalRows]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 50)
      .map(toRowView);
    suppressions = suppressionRows.map((s) => ({
      id: s.id,
      email: s.email,
      reason: s.reason,
      source: s.source,
      createdAt: s.created_at,
    }));
    digestQueue = digests;
    pushSubscriptions = push;
  } catch {
    // Missing tables (pre-065) or a transient read failure — render the
    // inert state; never 500 the admin shell.
    ledgerAvailable = false;
  }

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Notification engine</h1>
        <p className={styles.subtitle}>
          Delivery ledger operations: activation stage, queue health, dead
          letters with single-row requeue, suppressions, digests, and web-push
          subscription health. This surface cannot send anything.
        </p>
      </header>
      <NotificationOps
        stage={stage}
        ledgerAvailable={ledgerAvailable}
        statusCounts={statusCounts}
        recent={recent}
        deadLetters={deadLetters}
        suppressions={suppressions}
        digestQueue={digestQueue}
        pushSubscriptions={pushSubscriptions}
      />
    </section>
  );
}
