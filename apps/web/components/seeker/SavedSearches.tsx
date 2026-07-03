"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";

import {
  deleteSavedSearchAction,
  saveSearchAction,
} from "../../app/actions/savedSearch";
import styles from "./SavedSearches.module.css";

/** Pre-built view (href computed server-side from the stored filters). */
export interface SavedSearchView {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /** Live listings published since this search was saved that still match it. */
  readonly newCount?: number;
}

/** Filter shape derived from the action — avoids importing the server-only db module. */
type Filters = Parameters<typeof saveSearchAction>[0];

/** Mirror of savedSearchToQueryString (server-only) so we can match the current
 *  filters against a saved search's href client-side. Keep the param order. */
function toQueryString(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  if (f.housing) p.set("housing", "1");
  if (f.meals) p.set("meals", "1");
  if (f.visa) p.set("visa", "1");
  if (f.startRangeMonths) p.set("start_range", String(f.startRangeMonths));
  if (f.payMin) p.set("pay_min", String(f.payMin));
  if (f.payUnit) p.set("pay_unit", f.payUnit);
  if (f.location) p.set("location", f.location);
  return p.toString();
}

export interface SavedSearchesProps {
  readonly searches: readonly SavedSearchView[];
  readonly currentFilters: Filters;
  readonly currentLabel: string;
  /** There are active filters worth saving. */
  readonly canSave: boolean;
}

/**
 * Saved searches — re-run a stored triad-first search in one tap, or save the
 * current one. The retention flywheel: the seeker comes back to the search that
 * found them the right work. (Alert delivery on new matches lands next.)
 */
export function SavedSearches({
  searches,
  currentFilters,
  currentLabel,
  canSave,
}: SavedSearchesProps) {
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const onSave = () => {
    startTransition(async () => {
      const res = await saveSearchAction(currentFilters, currentLabel);
      if (res.ok) setJustSaved(true);
    });
  };

  const onDelete = (id: string) => {
    setDeletingId(id);
    startTransition(async () => {
      await deleteSavedSearchAction(id);
      setDeletingId(null);
    });
  };

  if (searches.length === 0 && !canSave) {
    return null;
  }

  const currentQs = toQueryString(currentFilters);
  const alreadySaved = searches.some((s) => s.href === currentQs);
  const showSaveButton = canSave && !alreadySaved && !justSaved;
  const showSavedFlag = canSave && (alreadySaved || justSaved);

  return (
    <div className={styles.root}>
      {searches.length > 0 ? (
        <div className={styles.scroll} role="group" aria-label="Your saved searches">
          <span className={styles.lead}>
            <Icon name="action.save" size={16} aria-hidden />
            Saved
          </span>
          {searches.map((s) => (
            <span key={s.id} className={styles.chip}>
              <Link
                href={`/seek?${s.href}`}
                className={styles.chipLink}
                aria-label={
                  s.newCount && s.newCount > 0
                    ? `${s.label} — ${s.newCount} new ${s.newCount === 1 ? "match" : "matches"}`
                    : s.label
                }
              >
                {s.label}
                {s.newCount && s.newCount > 0 ? (
                  <span className={styles.newBadge}>
                    {s.newCount > 9 ? "9+" : s.newCount} new
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove saved search: ${s.label}`}
                disabled={pending && deletingId === s.id}
                onClick={() => onDelete(s.id)}
              >
                <Icon name="action.close" size={16} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {showSaveButton ? (
        <button
          type="button"
          className={styles.saveBtn}
          disabled={pending}
          onClick={onSave}
        >
          <Icon name="action.save" size={16} aria-hidden />
          Save this search
        </button>
      ) : showSavedFlag ? (
        <span className={styles.savedFlag}>
          <Icon name="system.success" size={16} aria-hidden />
          Search saved
        </span>
      ) : null}
    </div>
  );
}
