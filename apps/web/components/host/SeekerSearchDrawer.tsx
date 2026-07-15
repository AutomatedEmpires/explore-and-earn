"use client";

import {
  useState,
  useRef,
  useTransition,
  useCallback,
  type FormEvent,
} from "react";
import { Button, Icon } from "@explore-and-earn/ui";
import type { SeekerSearchResult } from "@explore-and-earn/db/client";

import { searchSeekersAction, sendInviteAction } from "../../app/actions/invites";
import { PopupShell } from "../overlay/PopupShell";
import styles from "./SeekerSearchDrawer.module.css";

/**
 * Map a server invite-action error code to host-facing copy. Never surfaces a
 * raw code — `invite_credits_required` is the metered blocked state (out of
 * monthly allowance + purchased credits), phrased as an upsell.
 */
function inviteErrorMessage(error?: string): string {
  switch (error) {
    case "already_invited":
      return "You already sent an invite to this seeker for this listing.";
    case "invite_credits_required":
      return "You're out of invite credits this month. Buy more from the Matched seekers panel, or wait for next month's allowance.";
    case "rate_limit_exceeded":
      return "You've hit the hourly invite limit. Try again shortly.";
    case "forbidden":
      return "That listing isn't one of yours.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export interface SeekerSearchDrawerProps {
  /** The listing the host wants to invite seekers to. */
  readonly listingId: string;
  readonly listingTitle: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/**
 * Slide-in drawer for the host invitation flow: search seekers by name or bio,
 * select one, optionally write a personalised message, and send an invite.
 * Calls `searchSeekersAction` and `sendInviteAction` via server actions.
 */
export function SeekerSearchDrawer({
  listingId,
  listingTitle,
  isOpen,
  onClose,
}: SeekerSearchDrawerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SeekerSearchResult[]>([]);
  const [selected, setSelected] = useState<SeekerSearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSending, startSend] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!query.trim()) return;
      startSearch(async () => {
        const found = await searchSeekersAction(query);
        setResults(found);
        setSelected(null);
        setSentId(null);
        setSendError(null);
      });
    },
    [query],
  );

  function handleSelect(seeker: SeekerSearchResult) {
    setSelected(seeker);
    setSentId(null);
    setSendError(null);
  }

  function handleSend() {
    if (!selected) return;
    startSend(async () => {
      setSendError(null);
      const result = await sendInviteAction(
        selected.seekerProfileId,
        listingId,
        message.trim() || undefined,
      );
      if (result.ok) {
        setSentId(selected.seekerProfileId);
        setSelected(null);
        setMessage("");
      } else {
        setSendError(inviteErrorMessage(result.error));
      }
    });
  }

  function handleClose() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setMessage("");
    setSendError(null);
    setSentId(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <PopupShell
      open={isOpen}
      onClose={handleClose}
      title="Invite a seeker"
      eyebrow={
        <>
          <Icon name="action.forward" size={16} aria-hidden />
          <span>Host outreach</span>
        </>
      }
      headerMeta={
        <span>
          Listing · <strong>{listingTitle}</strong>
        </span>
      }
      size="compact"
      closeLabel="Close invite popup"
    >
        <form className={styles.search} onSubmit={handleSearch}>
          <input
            ref={searchRef}
            className={styles.input}
            type="search"
            placeholder="Search seekers by name or bio…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search seekers"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" disabled={isSearching || !query.trim()}>
            {isSearching ? "Searching…" : "Search"}
          </Button>
        </form>

        {results.length > 0 && !selected ? (
          <ul className={styles.results} role="listbox" aria-label="Search results">
            {results.map((seeker) => (
              <li key={seeker.seekerProfileId} role="option" aria-selected={false}>
                <button
                  type="button"
                  className={styles.resultItem}
                  onClick={() => handleSelect(seeker)}
                  disabled={sentId === seeker.seekerProfileId}
                >
                  <span className={styles.resultName}>
                    {seeker.displayName ?? "Anonymous seeker"}
                  </span>
                  {seeker.bio ? (
                    <span className={styles.resultBio}>{seeker.bio}</span>
                  ) : null}
                  {sentId === seeker.seekerProfileId ? (
                    <span className={styles.sentBadge}>
                      <Icon name="system.success" size={16} aria-hidden />
                      Invite sent
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {results.length === 0 && query.trim() && !isSearching ? (
          <p className={styles.empty}>No seekers found for &ldquo;{query}&rdquo;</p>
        ) : null}

        {selected ? (
          <section className={styles.compose}>
            <div className={styles.selectedInfo}>
              <Icon name="status.match" size={20} aria-hidden />
              <span>
                Inviting:{" "}
                <strong>{selected.displayName ?? "Anonymous seeker"}</strong>
              </span>
              <button
                type="button"
                className={styles.clearSelected}
                onClick={() => setSelected(null)}
                aria-label="Choose a different seeker"
              >
                <Icon name="action.close" size={16} aria-hidden />
              </button>
            </div>

            <label className={styles.label} htmlFor="invite-message">
              Personal message (optional)
            </label>
            <textarea
              id="invite-message"
              className={styles.textarea}
              rows={4}
              placeholder="Add a personal note to make your invite stand out…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
            />
            <span className={styles.charCount}>{message.length}/500</span>

            {sendError ? (
              <p className={styles.error} role="alert">
                <Icon name="system.error" size={16} aria-hidden />
                {sendError}
              </p>
            ) : null}

            <div className={styles.sendRow}>
              <Button
                variant="ghost"
                onClick={() => setSelected(null)}
                disabled={isSending}
              >
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={isSending}
                icon="action.forward"
              >
                {isSending ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </section>
        ) : null}

        {sentId && !selected ? (
          <p className={styles.successBanner} role="status">
            <Icon name="system.success" size={20} aria-hidden />
            Invite sent successfully!
          </p>
        ) : null}
    </PopupShell>
  );
}
