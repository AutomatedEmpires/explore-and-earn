"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@explore-and-earn/ui";
import {
  ANNOUNCEMENT_FREE_DURATION_DAYS,
  ANNOUNCEMENT_MONTHLY_QUOTA,
  ANNOUNCEMENT_PRICE_CENTS,
  ANNOUNCEMENT_RUN_DAYS,
} from "@explore-and-earn/contracts";

import type {
  ActivateDraftResult,
  AnnouncementCheckoutResult,
  PostAnnouncementResult,
} from "../../app/actions/community";
import {
  activateDraftAnnouncementAction,
  createAnnouncementCheckoutAction,
  postHostAnnouncementAction,
} from "../../app/actions/community";
import { captureFunnelEvent } from "../../lib/analytics/capture";
import { HOST_WORKSPACE_EVENTS } from "../../lib/analytics/events";
import { formatMoney } from "../../lib/format";
import styles from "./HostAnnouncementComposer.module.css";

/**
 * The announcement composer (V2 §10).
 *
 * THREE THINGS CHANGED FROM THE PRE-V2 COMPOSER, and each answers a way the old
 * one could mislead:
 *
 *   · A LIVE PREVIEW. An announcement is read in a feed, at whatever width the
 *     reader's device happens to be, and the composer previously showed a form
 *     and nothing else. The preview renders the exact title/body/kind as typed,
 *     at both widths, so an 80-character headline that wraps badly on a phone is
 *     visible before it is published rather than after.
 *
 *   · A CONFIRMATION STEP THAT STATES THE COST. Publishing is irreversible in
 *     the only sense that matters — it goes out to the marketplace — and it
 *     spends either a plan allowance or $149. The old composer's button did that
 *     from one click with the price rendered as a marketing tile. Now the review
 *     panel names the run length, what it spends, and what is left afterwards.
 *
 *   · NO SCHEDULING. `host_announcements` has no scheduled_at column and no
 *     runner; the composer therefore offers PUBLISH NOW and says so. The demo
 *     workspace shows a scheduled row because that is where the concept is being
 *     designed — presenting it here as a working control would be a button that
 *     silently published immediately.
 */

interface Props {
  readonly subscriptionTier: string;
  readonly usedThisMonth: number;
  /** A paid-for row awaiting its content, from getLatestDraftAnnouncement. */
  readonly draftAnnouncementId: string | null;
}

type AnnouncementKind = "general" | "hiring" | "event";

/** Which pane the preview is imitating. Desktop first; both always reachable. */
type PreviewWidth = "desktop" | "mobile";

const KIND_LABELS: Record<AnnouncementKind, string> = {
  general: "General",
  hiring: "Now Hiring",
  event: "Event",
};

export function HostAnnouncementComposer({
  subscriptionTier,
  usedThisMonth,
  draftAnnouncementId,
}: Props) {
  const router = useRouter();
  const quota = ANNOUNCEMENT_MONTHLY_QUOTA[subscriptionTier] ?? 0;
  const canPostFree = quota > 0 && usedThisMonth < quota;
  const hasDraft = Boolean(draftAnnouncementId);
  const remaining = Math.max(0, quota - usedThisMonth);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<AnnouncementKind>("general");
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ready = title.trim().length > 0 && body.trim().length > 0;
  const runDays = hasDraft ? ANNOUNCEMENT_RUN_DAYS : ANNOUNCEMENT_FREE_DURATION_DAYS;

  function reset() {
    setTitle("");
    setBody("");
    setKind("general");
    setConfirming(false);
  }

  function publish() {
    setError(null);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("body", body);
    fd.set("kind", kind);

    startTransition(async () => {
      if (hasDraft) {
        const result: ActivateDraftResult = await activateDraftAnnouncementAction(
          draftAnnouncementId as string,
          fd,
        );
        if (!result.ok) {
          setError("Could not publish. Please try again.");
          setConfirming(false);
          return;
        }
        // The ROW already existed — the Stripe webhook created it. Only the
        // publication is news, so only the publication is reported.
        captureFunnelEvent(HOST_WORKSPACE_EVENTS.announcementPublished, {
          kind,
          purchased: true,
        });
      } else {
        const result: PostAnnouncementResult =
          await postHostAnnouncementAction(fd);
        if (!result.ok) {
          setError(
            result.reason === "quota_exceeded"
              ? "This month's included runs are spent. A single run is still available as a purchase."
              : "Something went wrong. Please try again.",
          );
          setConfirming(false);
          return;
        }
        // A plan-included run is created and published in the same statement,
        // so both are true and both are reported.
        captureFunnelEvent(HOST_WORKSPACE_EVENTS.announcementCreated, {
          kind,
          purchased: false,
        });
        captureFunnelEvent(HOST_WORKSPACE_EVENTS.announcementPublished, {
          kind,
          purchased: false,
        });
      }
      setSuccess(true);
      reset();
      router.refresh();
    });
  }

  function handlePurchase() {
    setError(null);
    startTransition(async () => {
      const result: AnnouncementCheckoutResult =
        await createAnnouncementCheckoutAction();
      if (result.ok) {
        window.location.href = result.sessionUrl;
      } else {
        setError(
          result.reason === "no_stripe_config"
            ? "Payment is not configured in this environment yet."
            : "Payment setup failed — please try again.",
        );
      }
    });
  }

  if (success) {
    return (
      <div className={styles.successCard} role="status">
        <Icon name="system.success" size={24} aria-hidden />
        <p className={styles.successText}>
          Published. It runs for {runDays} days and appears in the community feed
          now.
        </p>
        <button
          className={styles.resetBtn}
          onClick={() => setSuccess(false)}
          type="button"
        >
          Write another
        </button>
      </div>
    );
  }

  // ── Nothing to spend: the purchase is the only way forward ──────────────
  if (!canPostFree && !hasDraft) {
    return (
      <div className={styles.composer}>
        <p className={styles.purchaseHeading}>
          {quota === 0
            ? "Your plan does not include announcement runs."
            : `You have used all ${quota} included run${quota > 1 ? "s" : ""} this month.`}
        </p>
        <p className={styles.purchaseBody}>
          A single {ANNOUNCEMENT_RUN_DAYS}-day run is{" "}
          {formatMoney(ANNOUNCEMENT_PRICE_CENTS)} — one flat price, no duration
          options to weigh up. You write the announcement after checkout, and
          nothing is published until you do.
        </p>
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handlePurchase}
          disabled={isPending}
        >
          {isPending
            ? "Opening checkout…"
            : `Buy a ${ANNOUNCEMENT_RUN_DAYS}-day run — ${formatMoney(ANNOUNCEMENT_PRICE_CENTS)}`}
        </button>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.composer}>
      <div className={styles.allowance}>
        <Icon name="system.info" size={16} aria-hidden />
        {hasDraft ? (
          <span>
            You have a paid {ANNOUNCEMENT_RUN_DAYS}-day run waiting for its
            content. Publishing it does not touch your monthly allowance.
          </span>
        ) : (
          <span>
            {remaining} of {quota} included run{quota > 1 ? "s" : ""} left this
            month. Each one runs for {ANNOUNCEMENT_FREE_DURATION_DAYS} days.
          </span>
        )}
      </div>

      <div className={styles.split}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setConfirming(true);
          }}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Headline <span aria-hidden>(max 80 characters)</span>
            </span>
            <input
              name="title"
              className={styles.input}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              required
              disabled={isPending}
              placeholder="What has changed, and who does it matter to?"
            />
            <span className={styles.charCount}>{title.length}/80</span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Message <span aria-hidden>(max 500 characters)</span>
            </span>
            <textarea
              name="body"
              className={styles.textarea}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={500}
              required
              rows={5}
              disabled={isPending}
              placeholder="News, a hiring call-out, or an upcoming event."
            />
            <span className={styles.charCount}>{body.length}/500</span>
          </label>

          <fieldset className={styles.kindGroup}>
            <legend className={styles.fieldLabel}>Type</legend>
            {(Object.keys(KIND_LABELS) as AnnouncementKind[]).map((key) => (
              <label key={key} className={styles.kindOption}>
                <input
                  type="radio"
                  name="kind"
                  value={key}
                  checked={kind === key}
                  onChange={() => setKind(key)}
                  disabled={isPending}
                />
                <span>{KIND_LABELS[key]}</span>
              </label>
            ))}
          </fieldset>

          <p className={styles.scheduleNote}>
            Announcements publish immediately — there is no scheduling yet, so
            nothing is queued for a later date.
          </p>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <button className={styles.submitBtn} type="submit" disabled={!ready || isPending}>
            Review before publishing
          </button>
        </form>

        <div className={styles.previewColumn}>
          <div className={styles.previewHead}>
            <h3 className={styles.previewTitle}>Preview</h3>
            <div className={styles.segmented} role="group" aria-label="Preview width">
              {(["desktop", "mobile"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.segment}
                  aria-pressed={previewWidth === value}
                  onClick={() => setPreviewWidth(value)}
                >
                  {value === "desktop" ? "Desktop" : "Mobile"}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.previewFrame} data-width={previewWidth}>
            <article className={styles.previewCard}>
              <span className={styles.previewKind}>{KIND_LABELS[kind]}</span>
              <h4 className={styles.previewCardTitle}>
                {title.trim() || "Your headline appears here"}
              </h4>
              <p className={styles.previewCardBody}>
                {body.trim() ||
                  "Your message appears here, exactly as a seeker reads it in the community feed."}
              </p>
            </article>
          </div>
          <p className={styles.previewNote}>
            Rendered from what you have typed. Nothing is saved until you
            publish.
          </p>
        </div>
      </div>

      {confirming ? (
        <div className={styles.confirm} role="group" aria-label="Confirm publication">
          <h3 className={styles.confirmTitle}>Publish this announcement?</h3>
          <ul className={styles.confirmList}>
            <li className={styles.confirmItem}>
              It goes out to the community feed immediately and runs for{" "}
              {runDays} days.
            </li>
            <li className={styles.confirmItem}>
              {hasDraft
                ? `Already paid: ${formatMoney(ANNOUNCEMENT_PRICE_CENTS)} for this single run. Your monthly allowance is untouched.`
                : `This uses 1 of your ${quota} included run${quota > 1 ? "s" : ""} this month, leaving ${remaining - 1}.`}
            </li>
            <li className={styles.confirmItem}>
              There is no edit-after-publish and no unpublish control — you can
              write a new announcement, but this one runs its course.
            </li>
          </ul>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Keep editing
            </button>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={publish}
              disabled={isPending}
            >
              {isPending ? "Publishing…" : "Publish now"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
