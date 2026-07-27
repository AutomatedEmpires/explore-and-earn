"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeProps, Button, Icon, type IconKey } from "@explore-and-earn/ui";

import {
  getMyRefundablePurchasesAction,
  requestRefundAction,
} from "../../app/actions/refunds";
import styles from "./HostRefundPanel.module.css";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** A purchase the host can request a refund on (from getHostRefundablePurchases). */
export interface RefundablePurchaseView {
  readonly purchaseType: string;
  readonly referenceId: string | null;
  readonly amountCents: number;
  readonly label: string;
  readonly purchasedAt: string;
  readonly hasOpenRequest: boolean;
  readonly alreadyRefunded: boolean;
}

/** One of the host's prior refund requests (from getHostRefundRequests). */
export interface HostRefundRequestView {
  readonly id: string;
  readonly purchaseType: string;
  readonly amountCents: number;
  readonly reason: string | null;
  readonly status: string;
  readonly adminNote: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

/** Integer cents -> a clean USD string. */
function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function purchaseLabel(type: string): string {
  switch (type) {
    case "subscription":
      return "Host subscription";
    case "announcement":
      return "Announcement";
    case "boost":
      return "Listing boost";
    default:
      return type;
  }
}

function statusVariant(status: string): BadgeVariant {
  if (status === "refunded") return "success";
  if (status === "denied") return "neutral";
  if (status === "failed") return "info";
  return "featured"; // requested / approved (in flight)
}

function statusIcon(status: string): IconKey {
  if (status === "refunded") return "status.accepted";
  if (status === "denied") return "status.declined";
  if (status === "failed") return "system.warning";
  return "status.open"; // requested / approved (in flight)
}

function statusLabel(status: string): string {
  switch (status) {
    case "requested":
      return "Under review";
    // 'approved' is the transient state a request sits in while the Stripe
    // refund is being issued. It must not read as "done" — the money has not
    // been confirmed back yet.
    case "approved":
      return "Processing refund";
    case "refunded":
      return "Refunded";
    case "denied":
      return "Denied";
    case "failed":
      return "Refund failed";
    default:
      return status;
  }
}

/** Stable option key per purchase (subscription has no reference id). */
const SUBSCRIPTION_KEY = "subscription";

function purchaseKey(p: RefundablePurchaseView): string {
  return p.referenceId ? `${p.purchaseType}:${p.referenceId}` : p.purchaseType;
}

export interface HostRefundPanelProps {
  /** The host's own prior refund requests (RLS-scoped), newest first. */
  readonly history: ReadonlyArray<HostRefundRequestView>;
}

/**
 * Host "Request a refund" affordance on /host/billing.
 *
 * Lists the host's own refundable purchases (announcements + boosts with a
 * Stripe charge) plus a subscription option, and lets them file ONE request per
 * purchase with a reason. Submitting calls requestRefundAction — which records a
 * 'requested' row; NO money moves here. A real Stripe refund only happens later
 * when an admin approves. The host's request history (with live status) renders
 * below so they can follow the outcome. Token-pure, composes the shared Button /
 * Badge / Icon primitives.
 */
export function HostRefundPanel({ history }: HostRefundPanelProps) {
  const router = useRouter();
  const [purchases, setPurchases] = useState<RefundablePurchaseView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [subscriptionAmount, setSubscriptionAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load the host's refundable purchases once (server action — service-role read
  // gated by host ownership). Boosts that have ended are only visible this way.
  useEffect(() => {
    let active = true;
    void getMyRefundablePurchasesAction().then((result) => {
      if (!active) return;
      if (result.ok && result.purchases) {
        setPurchases(result.purchases as RefundablePurchaseView[]);
      } else {
        setLoadError("Could not load your purchases right now.");
        setPurchases([]);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const selectedIsSubscription = selectedKey === SUBSCRIPTION_KEY;
  const selectedPurchase = purchases?.find((p) => purchaseKey(p) === selectedKey) ?? null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!selectedKey) {
      setFormError("Choose what you'd like refunded.");
      return;
    }

    startTransition(async () => {
      const result = await requestRefundAction(
        selectedIsSubscription
          ? {
              purchaseType: "subscription",
              reason: reason || null,
              amountCents: Math.round(Number(subscriptionAmount) * 100),
            }
          : {
              purchaseType: (selectedPurchase?.purchaseType ??
                "announcement") as "announcement" | "boost",
              referenceId: selectedPurchase?.referenceId ?? null,
              reason: reason || null,
            },
      );

      if (!result.ok) {
        setFormError(
          result.error === "host_profile_missing"
            ? "Complete host onboarding before requesting a refund."
            : result.error ?? "Could not submit your request.",
        );
        return;
      }

      setSuccess("Refund request submitted. An admin will review it shortly.");
      setSelectedKey("");
      setSubscriptionAmount("");
      setReason("");
      router.refresh();
    });
  }

  // A purchase is selectable unless it already has an open request or refund.
  const selectablePurchases = (purchases ?? []).filter(
    (p) => !p.hasOpenRequest && !p.alreadyRefunded,
  );

  return (
    <div className={styles.panel}>
      <div className={styles.intro}>
        <span className={styles.introIcon} aria-hidden="true">
          <Icon name="benefit.pay" size={20} />
        </span>
        <p className={styles.introText}>
          Requesting a refund doesn&apos;t charge or credit anything immediately —
          it opens a request an admin reviews. You&apos;ll see the outcome here.
        </p>
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>What would you like refunded?</span>
          <select
            className={styles.select}
            value={selectedKey}
            onChange={(e) => {
              setSelectedKey(e.target.value);
              setFormError(null);
              setSuccess(null);
            }}
            disabled={purchases === null || isPending}
          >
            <option value="">
              {purchases === null ? "Loading your purchases…" : "Select a purchase…"}
            </option>
            <option value={SUBSCRIPTION_KEY}>Host subscription (most recent charge)</option>
            {selectablePurchases.map((p) => (
              <option key={purchaseKey(p)} value={purchaseKey(p)}>
                {purchaseLabel(p.purchaseType)} — {p.label} · {formatCents(p.amountCents)}
              </option>
            ))}
          </select>
        </label>

        {selectedIsSubscription ? (
          <label className={styles.field}>
            <span className={styles.label}>Amount charged (USD)</span>
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="e.g. 149.00"
              value={subscriptionAmount}
              onChange={(e) => setSubscriptionAmount(e.target.value)}
              disabled={isPending}
            />
            <span className={styles.hint}>
              We&apos;ll verify the exact charge in Stripe before issuing any refund.
            </span>
          </label>
        ) : selectedPurchase ? (
          <p className={styles.selectedAmount}>
            Refund amount:{" "}
            <strong>{formatCents(selectedPurchase.amountCents)}</strong>
          </p>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>Reason (optional)</span>
          <textarea
            className={styles.textarea}
            rows={3}
            maxLength={600}
            placeholder="Tell us why you're requesting a refund."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isPending}
          />
        </label>

        {formError ? (
          <p className={styles.error} role="alert">
            <Icon aria-hidden name="system.error" size={16} />
            {formError}
          </p>
        ) : null}
        {loadError && !formError ? (
          <p className={styles.error} role="alert">
            <Icon aria-hidden name="system.warning" size={16} />
            {loadError}
          </p>
        ) : null}
        {success ? (
          <p className={styles.success} role="status">
            <Icon aria-hidden name="system.success" size={16} />
            {success}
          </p>
        ) : null}

        <div className={styles.submitRow}>
          <Button
            type="submit"
            variant="primary"
            icon="action.apply"
            disabled={isPending || purchases === null || !selectedKey}
          >
            {isPending ? "Submitting…" : "Request refund"}
          </Button>
        </div>
      </form>

      <div className={styles.history}>
        <h3 className={styles.historyTitle}>Your refund requests</h3>
        {history.length === 0 ? (
          <p className={styles.historyEmpty}>You haven&apos;t requested any refunds yet.</p>
        ) : (
          <ul className={styles.historyList}>
            {history.map((req) => (
              <li key={req.id} className={styles.historyItem}>
                <div className={styles.historyHead}>
                  <span className={styles.historyAmount}>
                    {formatCents(req.amountCents)}
                  </span>
                  <Badge
                    label={statusLabel(req.status)}
                    variant={statusVariant(req.status)}
                    icon={statusIcon(req.status)}
                  />
                </div>
                <p className={styles.historyMeta}>
                  {purchaseLabel(req.purchaseType)}
                  <span className={styles.metaDot} aria-hidden="true" />
                  {formatDate(req.createdAt)}
                </p>
                {req.reason ? (
                  <p className={styles.historyReason}>“{req.reason}”</p>
                ) : null}
                {req.adminNote ? (
                  <p className={styles.historyNote}>
                    <strong>Admin:</strong> {req.adminNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
