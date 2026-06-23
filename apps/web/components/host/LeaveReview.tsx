"use client";

import { useState, useTransition } from "react";

import { Icon } from "@explore-and-earn/ui";

import { submitHostReviewAction } from "../../app/actions/hostReview";
import styles from "./LeaveReview.module.css";

type Input = Parameters<typeof submitHostReviewAction>[2];
type PromiseKey = "housing" | "meals" | "pay";

export interface LeaveReviewProps {
  readonly hostName: string;
  readonly hostProfileId: string;
  readonly applicationId: string;
}

const PROMISES: ReadonlyArray<{ key: PromiseKey; label: string }> = [
  { key: "housing", label: "Was housing as described?" },
  { key: "meals", label: "Were meals as described?" },
  { key: "pay", label: "Was pay on time?" },
];

/**
 * The write half of two-sided trust. Only rendered when the viewer is a seeker
 * with a completed/active engagement with this host (eligibility resolved on the
 * server). The three Yes/No promise toggles map straight to the triad-trust
 * booleans — the data that powers the host's "promises kept" reputation.
 */
export function LeaveReview({ hostName, hostProfileId, applicationId }: LeaveReviewProps) {
  const [rating, setRating] = useState(0);
  const [housing, setHousing] = useState<boolean | null>(null);
  const [meals, setMeals] = useState<boolean | null>(null);
  const [pay, setPay] = useState<boolean | null>(null);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  if (done) {
    return (
      <section className={styles.root}>
        <div className={styles.thanks}>
          <Icon name="system.success" size={24} aria-hidden />
          <p>Thanks — your review helps the next seeker trust {hostName}.</p>
        </div>
      </section>
    );
  }

  const valueOf = (key: PromiseKey): boolean | null =>
    key === "housing" ? housing : key === "meals" ? meals : pay;
  const setValue = (key: PromiseKey, val: boolean) => {
    const next = valueOf(key) === val ? null : val; // tap again to clear
    if (key === "housing") setHousing(next);
    else if (key === "meals") setMeals(next);
    else setPay(next);
  };

  const onSubmit = () => {
    if (rating === 0) return;
    setError(false);
    const input: Input = {
      rating,
      housingAsDescribed: housing,
      mealsAsDescribed: meals,
      payOnTime: pay,
      body: body.trim(),
    };
    startTransition(async () => {
      const res = await submitHostReviewAction(hostProfileId, applicationId, input);
      if (res.ok) setDone(true);
      else setError(true);
    });
  };

  return (
    <section className={styles.root} aria-labelledby="leave-review-heading">
      <h2 id="leave-review-heading" className={styles.heading}>
        Review {hostName}
      </h2>
      <p className={styles.sub}>
        You worked here — help the next seeker know what to expect.
      </p>

      <div className={styles.stars} role="group" aria-label="Overall rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`${styles.star} ${n <= rating ? styles.starOn : ""}`.trim()}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={n <= rating}
            onClick={() => setRating(n)}
          >
            <Icon name="status.featured" size={24} aria-hidden />
          </button>
        ))}
      </div>

      <div className={styles.promises}>
        {PROMISES.map((p) => (
          <div key={p.key} className={styles.promiseRow}>
            <span className={styles.promiseLabel}>{p.label}</span>
            <div className={styles.yesno}>
              <button
                type="button"
                className={`${styles.toggle} ${valueOf(p.key) === true ? styles.toggleYes : ""}`.trim()}
                aria-pressed={valueOf(p.key) === true}
                onClick={() => setValue(p.key, true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`${styles.toggle} ${valueOf(p.key) === false ? styles.toggleNo : ""}`.trim()}
                aria-pressed={valueOf(p.key) === false}
                onClick={() => setValue(p.key, false)}
              >
                No
              </button>
            </div>
          </div>
        ))}
      </div>

      <label className={styles.bodyLabel} htmlFor="review-body">
        Your review (optional)
      </label>
      <textarea
        id="review-body"
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="How were the housing, meals, pay, and the work itself?"
        maxLength={1000}
        rows={4}
      />

      {error ? (
        <p className={styles.error} role="alert">
          Could not submit your review. Please try again.
        </p>
      ) : null}

      <button
        type="button"
        className={styles.submit}
        disabled={rating === 0 || pending}
        onClick={onSubmit}
      >
        {pending ? "Submitting…" : "Submit review"}
      </button>
    </section>
  );
}
