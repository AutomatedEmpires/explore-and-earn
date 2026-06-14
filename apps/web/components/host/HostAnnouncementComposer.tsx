"use client";

import { useState, useTransition } from "react";
import { Icon } from "@explore-and-earn/ui";
import { ANNOUNCEMENT_MONTHLY_QUOTA } from "@explore-and-earn/contracts";

import type {
  ActivateDraftResult,
  AnnouncementCheckoutResult,
  PostAnnouncementResult,
} from "../../app/actions/community";
import {
  activateDraftAnnouncementAction,
  createAnnouncementCheckoutAction,
  postHostAnnouncementAction,
  ANNOUNCEMENT_PRICING,
} from "../../app/actions/community";
import styles from "./HostAnnouncementComposer.module.css";

interface Props {
  readonly subscriptionTier: string;
  readonly usedThisMonth: number;
  readonly draftAnnouncementId: string | null;
}

type AnnouncementKind = "general" | "hiring" | "event";
type Duration = 7 | 14 | 28;

const KIND_LABELS: Record<AnnouncementKind, string> = {
  general: "General",
  hiring:  "Now Hiring",
  event:   "Event",
};

const DURATION_META: Record<Duration, { label: string; tagline: string }> = {
  7:  { label: "7-Day Boost",       tagline: "Reach seekers for a full week" },
  14: { label: "14-Day Spotlight",  tagline: "Double coverage over two weeks" },
  28: { label: "28-Day Feature",    tagline: "Max visibility for a full month" },
};

export function HostAnnouncementComposer({
  subscriptionTier,
  usedThisMonth,
  draftAnnouncementId,
}: Props) {
  const quota = ANNOUNCEMENT_MONTHLY_QUOTA[subscriptionTier] ?? 0;
  const canPostFree = quota > 0 && usedThisMonth < quota;
  const hasDraft = Boolean(draftAnnouncementId);

  const [title, setTitle]     = useState("");
  const [body, setBody]       = useState("");
  const [kind, setKind]       = useState<AnnouncementKind>("general");
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFreeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result: PostAnnouncementResult = await postHostAnnouncementAction(fd);
      if (result.ok) {
        setSuccess(true);
        setTitle("");
        setBody("");
        setKind("general");
      } else {
        setError(
          result.reason === "quota_exceeded"
            ? "Monthly quota reached — purchase a timed slot to continue posting."
            : "Something went wrong. Please try again.",
        );
      }
    });
  }

  function handleDraftSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result: ActivateDraftResult = await activateDraftAnnouncementAction(
        draftAnnouncementId!,
        fd,
      );
      if (result.ok) {
        setSuccess(true);
        setTitle("");
        setBody("");
        setKind("general");
      } else {
        setError("Could not publish. Please try again.");
      }
    });
  }

  function handlePurchase(duration: Duration) {
    setError(null);
    startTransition(async () => {
      const result: AnnouncementCheckoutResult = await createAnnouncementCheckoutAction(duration);
      if (result.ok) {
        window.location.href = result.sessionUrl;
      } else {
        setError(
          result.reason === "no_stripe_config"
            ? "Payment is not yet configured. Contact support."
            : "Payment setup failed — please try again.",
        );
      }
    });
  }

  if (success) {
    return (
      <div className={styles.successCard}>
        <Icon name="system.success" size={24} aria-hidden />
        <p>Your announcement is live!</p>
        <button
          className={styles.resetBtn}
          onClick={() => setSuccess(false)}
          type="button"
        >
          Post another
        </button>
      </div>
    );
  }

  // Post-purchase draft activation form
  if (hasDraft) {
    return (
      <div className={styles.composer}>
        <p className={styles.draftBadge}>
          <Icon name="system.info" size={16} aria-hidden />
          Your announcement slot is ready — add your content below.
        </p>
        <form onSubmit={handleDraftSubmit} className={styles.form}>
          <AnnouncementFormFields
            title={title} setTitle={setTitle}
            body={body}   setBody={setBody}
            kind={kind}   setKind={setKind}
            disabled={isPending}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.submitBtn} type="submit" disabled={isPending}>
            {isPending ? "Publishing…" : "Publish Announcement"}
          </button>
        </form>
      </div>
    );
  }

  // Free-post form (Pro/Enterprise within quota)
  if (canPostFree) {
    const remaining = quota - usedThisMonth;
    return (
      <div className={styles.composer}>
        <div className={styles.quotaBadge}>
          <Icon name="system.info" size={16} aria-hidden />
          <span>{remaining} of {quota} free post{quota > 1 ? "s" : ""} remaining this month</span>
        </div>
        <form onSubmit={handleFreeSubmit} className={styles.form}>
          <AnnouncementFormFields
            title={title} setTitle={setTitle}
            body={body}   setBody={setBody}
            kind={kind}   setKind={setKind}
            disabled={isPending}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.submitBtn} type="submit" disabled={isPending}>
            {isPending ? "Posting…" : "Post Announcement"}
          </button>
        </form>
      </div>
    );
  }

  // Purchase state (Starter or quota exhausted)
  return (
    <div className={styles.composer}>
      <p className={styles.purchaseHeading}>
        {subscriptionTier === "none" || subscriptionTier === "starter"
          ? "Boost your visibility with a timed announcement"
          : "You've used your free posts for this month — purchase a timed slot"}
      </p>
      <div className={styles.pricingCards}>
        {([7, 14, 28] as Duration[]).map((d) => (
          <button
            key={d}
            type="button"
            className={styles.pricingCard}
            onClick={() => handlePurchase(d)}
            disabled={isPending}
          >
            <span className={styles.pricingDuration}>{DURATION_META[d].label}</span>
            <span className={styles.pricingPrice}>
              ${(ANNOUNCEMENT_PRICING[d] / 100).toFixed(0)}
            </span>
            <span className={styles.pricingTagline}>{DURATION_META[d].tagline}</span>
          </button>
        ))}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

// ─── Shared form fields ───────────────────────────────────────────────────────

interface FieldProps {
  title: string; setTitle: (v: string) => void;
  body: string;  setBody:  (v: string) => void;
  kind: AnnouncementKind; setKind: (v: AnnouncementKind) => void;
  disabled: boolean;
}

function AnnouncementFormFields({ title, setTitle, body, setBody, kind, setKind, disabled }: FieldProps) {
  return (
    <>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Title <span aria-hidden>(max 80 chars)</span></span>
        <input
          name="title"
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          required
          disabled={disabled}
          placeholder="What would you like to share?"
        />
        <span className={styles.charCount}>{title.length}/80</span>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Message <span aria-hidden>(max 500 chars)</span></span>
        <textarea
          name="body"
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          required
          rows={4}
          disabled={disabled}
          placeholder="Share news, a hiring call-out, or an upcoming event."
        />
        <span className={styles.charCount}>{body.length}/500</span>
      </label>
      <fieldset className={styles.kindGroup}>
        <legend className={styles.fieldLabel}>Type</legend>
        {(Object.keys(KIND_LABELS) as AnnouncementKind[]).map((k) => (
          <label key={k} className={styles.kindOption}>
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              disabled={disabled}
            />
            <span>{KIND_LABELS[k]}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}
