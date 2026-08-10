"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@explore-and-earn/ui";
import type { SeekerSearchResult } from "@explore-and-earn/db/client";

import { searchSeekersAction, sendInviteAction } from "../../app/actions/invites";
import {
  filterPreviewSeekers,
  inviteErrorMessage,
  OUTREACH_PREVIEW_STATUS,
  searchDiscoveryErrorMessage,
} from "../../lib/hostOutreach";
import { PopupShell } from "../overlay/PopupShell";
import styles from "./SeekerSearchDrawer.module.css";

export interface OutreachSearchPreviewVM {
  readonly notice: string;
  readonly unavailableQuery: string;
  readonly seekersByListingId: Readonly<
    Record<string, readonly SeekerSearchResult[]>
  >;
}

export interface SeekerSearchDrawerProps {
  /** The listing the host wants to invite seekers to. */
  readonly listingId: string;
  readonly listingTitle: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Local-only, actionless data used by the real route's dev bench. */
  readonly preview?: OutreachSearchPreviewVM;
}

/** Search, select, compose, and invite without conflating failures with empty results. */
export function SeekerSearchDrawer({
  listingId,
  listingTitle,
  isOpen,
  onClose,
  preview,
}: SeekerSearchDrawerProps) {
  const router = useRouter();
  const resultDescriptionPrefix = useId();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<readonly SeekerSearchResult[]>([]);
  const [selected, setSelected] = useState<SeekerSearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [previewedIds, setPreviewedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [sentStatus, setSentStatus] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const searchInFlight = useRef(false);
  const sendInFlight = useRef(false);
  const searchEpoch = useRef(0);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const sentStatusRef = useRef<HTMLParagraphElement>(null);
  const resultRefs = useRef(new Map<string, HTMLButtonElement>());
  const restoreResultFocusId = useRef<string | null>(null);

  const normalizedQuery = query.replace(/\s+/g, " ").trim();

  useEffect(() => {
    if (sentStatus && !selected) {
      sentStatusRef.current?.focus();
      return;
    }
    if (selected) {
      messageRef.current?.focus();
      return;
    }
    const restoreId = restoreResultFocusId.current;
    if (!restoreId) return;
    restoreResultFocusId.current = null;
    resultRefs.current.get(restoreId)?.focus();
  }, [selected, sentStatus]);

  function handleQueryChange(nextQuery: string) {
    if (sendInFlight.current) return;
    // Editing the visible term invalidates any older response immediately. A
    // second submit may start without waiting for that stale request to settle;
    // the epoch prevents it from writing into the new search state.
    searchEpoch.current += 1;
    searchInFlight.current = false;
    setIsSearching(false);
    setQuery(nextQuery);
    setSubmittedQuery("");
    setHasSearched(false);
    setResults([]);
    setSelected(null);
    restoreResultFocusId.current = null;
    setMessage("");
    setSearchError(null);
    setSendError(null);
    setSentStatus(null);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      normalizedQuery.length < 2 ||
      searchInFlight.current ||
      sendInFlight.current
    ) {
      return;
    }

    const requestEpoch = ++searchEpoch.current;
    searchInFlight.current = true;
    setIsSearching(true);
    setSubmittedQuery(normalizedQuery);
    setHasSearched(false);
    setResults([]);
    setSelected(null);
    restoreResultFocusId.current = null;
    setMessage("");
    setSearchError(null);
    setSendError(null);
    setSentStatus(null);

    try {
      if (preview) {
        if (
          normalizedQuery.toLocaleLowerCase() ===
          preview.unavailableQuery.toLocaleLowerCase()
        ) {
          if (requestEpoch === searchEpoch.current) {
            setSearchError(searchDiscoveryErrorMessage("temporarily_unavailable"));
          }
          return;
        }
        if (requestEpoch === searchEpoch.current) {
          setResults(
            filterPreviewSeekers(
              preview.seekersByListingId[listingId] ?? [],
              normalizedQuery,
            ),
          );
        }
        return;
      }

      const result = await searchSeekersAction(listingId, normalizedQuery);
      if (requestEpoch !== searchEpoch.current) return;
      if (!result.ok) {
        setSearchError(searchDiscoveryErrorMessage(result.error));
        return;
      }
      setResults(result.seekers);
    } catch {
      if (requestEpoch === searchEpoch.current) {
        setSearchError(searchDiscoveryErrorMessage("temporarily_unavailable"));
      }
    } finally {
      if (requestEpoch === searchEpoch.current) {
        setHasSearched(true);
        setIsSearching(false);
        searchInFlight.current = false;
      }
    }
  }

  function handleSelect(seeker: SeekerSearchResult) {
    if (
      sendInFlight.current ||
      seeker.alreadyInvited ||
      invitedIds.has(seeker.seekerProfileId) ||
      previewedIds.has(seeker.seekerProfileId)
    ) {
      return;
    }
    restoreResultFocusId.current = seeker.seekerProfileId;
    setMessage("");
    setSelected(seeker);
    setSentStatus(null);
    setSendError(null);
  }

  function clearSelectedSeeker() {
    if (isSending) return;
    setSelected(null);
    setMessage("");
    setSendError(null);
  }

  async function handleSend() {
    if (!selected || sendInFlight.current) return;
    sendInFlight.current = true;
    setIsSending(true);
    setSendError(null);
    setSentStatus(null);

    try {
      if (preview) {
        setPreviewedIds((previous) =>
          new Set(previous).add(selected.seekerProfileId),
        );
        restoreResultFocusId.current = null;
        setSelected(null);
        setMessage("");
        setSentStatus(OUTREACH_PREVIEW_STATUS);
        return;
      }

      const result = await sendInviteAction(
        selected.seekerProfileId,
        listingId,
        message.trim() || undefined,
      );
      if (!result.ok) {
        if (result.error === "already_invited") {
          setInvitedIds((previous) =>
            new Set(previous).add(selected.seekerProfileId),
          );
          restoreResultFocusId.current = null;
          setSelected(null);
          setMessage("");
          setSentStatus("This seeker was already invited for this listing.");
          return;
        }
        setSendError(inviteErrorMessage(result.error));
        if (result.error === "invite_credits_required") router.refresh();
        return;
      }
      setInvitedIds((previous) =>
        new Set(previous).add(selected.seekerProfileId),
      );
      restoreResultFocusId.current = null;
      setSelected(null);
      setMessage("");
      setSentStatus("Invite sent successfully.");
    } catch {
      setSendError(inviteErrorMessage("temporarily_unavailable"));
    } finally {
      setIsSending(false);
      sendInFlight.current = false;
    }
  }

  function handleClose() {
    if (isSending) return;
    searchEpoch.current += 1;
    searchInFlight.current = false;
    setIsSearching(false);
    setQuery("");
    setSubmittedQuery("");
    setHasSearched(false);
    setResults([]);
    setSelected(null);
    restoreResultFocusId.current = null;
    setMessage("");
    setSearchError(null);
    setSendError(null);
    setInvitedIds(new Set());
    setPreviewedIds(new Set());
    setSentStatus(null);
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
      closeDisabled={isSending}
    >
      {preview ? (
        <p className={styles.previewNotice} role="note">
          <Icon name="system.info" size={16} aria-hidden />
          {preview.notice}
        </p>
      ) : null}

      <form
        className={styles.search}
        method="post"
        onSubmit={handleSearch}
        aria-busy={isSearching || isSending}
      >
        <input
          className={styles.input}
          type="search"
          placeholder="Search seekers by name or bio…"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          aria-label="Search seekers"
          autoComplete="off"
          maxLength={100}
          disabled={isSending}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={isSending || isSearching || normalizedQuery.length < 2}
        >
          {isSearching ? "Searching…" : "Search"}
        </Button>
      </form>

      {searchError ? (
        <p className={styles.error} role="alert">
          <Icon name="system.error" size={16} aria-hidden />
          {searchError}
        </p>
      ) : null}

      {results.length > 0 && !selected ? (
        <ul className={styles.results} aria-label="Search results">
          {results.map((seeker) => {
            const name = seeker.displayName ?? "Anonymous seeker";
            const descriptionId = `${resultDescriptionPrefix}-${seeker.seekerProfileId}`;
            const isAlreadyInvited =
              seeker.alreadyInvited || invitedIds.has(seeker.seekerProfileId);
            const isPreviewed = previewedIds.has(seeker.seekerProfileId);
            return (
              <li key={seeker.seekerProfileId}>
                <button
                  type="button"
                  className={styles.resultItem}
                  ref={(node) => {
                    if (node) resultRefs.current.set(seeker.seekerProfileId, node);
                    else resultRefs.current.delete(seeker.seekerProfileId);
                  }}
                  onClick={() => handleSelect(seeker)}
                  disabled={isSending || isAlreadyInvited || isPreviewed}
                  aria-describedby={seeker.bio ? descriptionId : undefined}
                  aria-label={
                    isAlreadyInvited
                      ? `Already invited: ${name}`
                      : isPreviewed
                        ? `Previewed: ${name}`
                        : `Choose ${name}`
                  }
                >
                  <span className={styles.resultName}>{name}</span>
                  {seeker.bio ? (
                    <span id={descriptionId} className={styles.resultBio}>
                      {seeker.bio}
                    </span>
                  ) : null}
                  {isAlreadyInvited || isPreviewed ? (
                    <span className={styles.sentBadge}>
                      <Icon name="system.success" size={16} aria-hidden />
                      {isPreviewed ? "Previewed locally" : "Already invited"}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hasSearched && !searchError && results.length === 0 && !isSearching ? (
        <p className={styles.empty} role="status">
          No seekers matched &ldquo;{submittedQuery}&rdquo;. Try another name or
          profile keyword.
        </p>
      ) : null}

      {selected ? (
        <section className={styles.compose} aria-label="Compose invite">
          <div className={styles.selectedInfo}>
            <Icon name="status.match" size={20} aria-hidden />
            <span>
              Inviting: <strong>{selected.displayName ?? "Anonymous seeker"}</strong>
            </span>
            <button
              type="button"
              className={styles.clearSelected}
              onClick={clearSelectedSeeker}
              aria-label="Choose a different seeker"
              disabled={isSending}
            >
              <Icon name="action.close" size={16} aria-hidden />
            </button>
          </div>

          <label className={styles.label} htmlFor="invite-message">
            Personal message (optional)
          </label>
          <textarea
            ref={messageRef}
            id="invite-message"
            className={styles.textarea}
            rows={4}
            placeholder="Add a personal note to make your invite stand out…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
            disabled={isSending}
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
              onClick={clearSelectedSeeker}
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
              {isSending ? "Sending…" : preview ? "Preview invite" : "Send invite"}
            </Button>
          </div>
        </section>
      ) : null}

      {sentStatus && !selected ? (
        <p
          ref={sentStatusRef}
          className={styles.successBanner}
          role="status"
          tabIndex={-1}
        >
          <Icon name="system.success" size={20} aria-hidden />
          {sentStatus}
        </p>
      ) : null}
    </PopupShell>
  );
}
