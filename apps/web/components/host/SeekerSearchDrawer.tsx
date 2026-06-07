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
import styles from "./SeekerSearchDrawer.module.css";

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
        setSendError(
          result.error === "already_invited"
            ? "You already sent an invite to this seeker for this listing."
            : result.error ?? "Something went wrong. Please try again.",
        );
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
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Invite a seeker"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className={styles.drawer}>
        <header className={styles.header}>
          <h2 className={styles.heading}>Invite a seeker</h2>
          <p className={styles.subheading}>
            Sending invite for: <strong>{listingTitle}</strong>
          </p>
          <button
            type="button"
            className={styles.close}
            onClick={handleClose}
            aria-label="Close invite drawer"
          >
            <Icon name="action.close" size={20} aria-hidden />
          </button>
        </header>

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
      </div>
    </div>
  );
}
