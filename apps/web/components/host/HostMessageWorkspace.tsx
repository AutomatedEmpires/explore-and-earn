"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@explore-and-earn/ui";
import type { Message } from "@explore-and-earn/db/client";

import { MessageTranscript } from "../messaging/MessageTranscript";
import { captureFunnelEvent } from "../../lib/analytics/capture";
import { HOST_WORKSPACE_EVENTS } from "../../lib/analytics/events";
import type { HostConversationSummary } from "./models";
import styles from "./HostMessageWorkspace.module.css";

/**
 * The host message workspace (V2 §9).
 *
 * THREE PANES ON A DESKTOP, ONE AT A TIME ON A PHONE. The list, the
 * conversation and the context rail are siblings in a grid at ≥1024px; below
 * that the grid collapses and the ACTIVE pane is chosen by the URL — a host on
 * a phone is either scanning threads or reading one, never both. The context
 * rail becomes a drawer the reader opens, because on a 390px column it is the
 * third thing they want and the first thing that would push the conversation
 * off screen.
 *
 * SELECTION IS A ROUTE, NOT STATE. `/host/messages/<id>` is the conversation,
 * so a thread can be linked to from the pipeline, opened in a new tab, and
 * arrived at from a notification — and the mobile "full screen" behaviour falls
 * out of the same fact instead of being a second code path. The server marks
 * the thread read on that route; a client-side selection would have had to
 * reimplement that and would have got the revalidation wrong.
 *
 * WHAT IS DELIBERATELY ABSENT, AND WHY. There is no ARCHIVE control: the
 * `conversations` table has no archived column, and migration 050 grants
 * `authenticated` UPDATE on exactly `last_message_at`, so an archive toggle
 * would be a button that raises `permission denied for column` — or worse, one
 * that hides a thread in local state and loses it on reload. There are no REPLY
 * TEMPLATES: nothing stores them. Both are named as gaps rather than faked.
 */

/** The one filter that is not free text: read state. */
type ReadFilter = "all" | "unread";

export interface HostMessageWorkspaceProps {
  readonly threads: readonly HostConversationSummary[];
  /** The conversation the route selected, or null on the index. */
  readonly activeId: string | null;
  /** Server-rendered transcript for `activeId` (oldest first). */
  readonly initialMessages: readonly Message[];
}

/** Case-insensitive "does this thread match what was typed" over what we show. */
function matchesQuery(thread: HostConversationSummary, query: string): boolean {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    thread.applicantName.toLowerCase().includes(needle) ||
    (thread.listingTitle ?? "").toLowerCase().includes(needle) ||
    thread.preview.toLowerCase().includes(needle)
  );
}

export function HostMessageWorkspace({
  threads,
  activeId,
  initialMessages,
}: HostMessageWorkspaceProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [listingFilter, setListingFilter] = useState<string>("all");
  const [contextOpen, setContextOpen] = useState(false);

  const active = useMemo(
    () => threads.find((thread) => thread.id === activeId) ?? null,
    [threads, activeId],
  );

  /**
   * The listing filter's options come from the threads themselves, so it can
   * never offer a listing the host has no conversation on — and it disappears
   * entirely when every thread shares one listing, where it would be a control
   * with a single meaningful setting.
   */
  const listingOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const thread of threads) {
      if (thread.listingId && thread.listingTitle) {
        seen.set(thread.listingId, thread.listingTitle);
      }
    }
    return [...seen.entries()].map(([id, title]) => ({ id, title }));
  }, [threads]);

  const visible = useMemo(
    () =>
      threads.filter((thread) => {
        if (readFilter === "unread" && !thread.unread) return false;
        if (listingFilter !== "all" && thread.listingId !== listingFilter) {
          return false;
        }
        return matchesQuery(thread, query);
      }),
    [threads, readFilter, listingFilter, query],
  );

  const unreadCount = threads.filter((thread) => thread.unread).length;
  const filtered =
    query.length > 0 || readFilter !== "all" || listingFilter !== "all";

  const onSent = useCallback(() => {
    captureFunnelEvent(HOST_WORKSPACE_EVENTS.messageSent, {
      has_listing: Boolean(active?.listingId),
    });
  }, [active?.listingId]);

  return (
    <div
      className={styles.workspace}
      data-pane={active ? "conversation" : "list"}
    >
      <section className={styles.listPane} aria-label="Conversations">
        <div className={styles.listHead}>
          <div className={styles.listTitleRow}>
            <h2 className={styles.paneTitle}>Threads</h2>
            <span className={styles.count}>
              {unreadCount > 0
                ? `${unreadCount} unread of ${threads.length}`
                : `${threads.length} total`}
            </span>
          </div>

          <label className={styles.searchLabel}>
            <span className={styles.srOnly}>Search conversations</span>
            <Icon name="nav.seek" size={16} aria-hidden />
            <input
              type="search"
              className={styles.search}
              value={query}
              placeholder="Search name, role, or message"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className={styles.filterRow}>
            <div className={styles.segmented} role="group" aria-label="Read state">
              {(["all", "unread"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.segment}
                  aria-pressed={readFilter === value}
                  onClick={() => setReadFilter(value)}
                >
                  {value === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
                </button>
              ))}
            </div>

            {listingOptions.length > 1 ? (
              <label className={styles.selectLabel}>
                <span className={styles.srOnly}>Filter by listing</span>
                <select
                  className={styles.select}
                  value={listingFilter}
                  onChange={(event) => setListingFilter(event.target.value)}
                >
                  <option value="all">Every listing</option>
                  {listingOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className={styles.threadScroll}>
          {visible.length === 0 ? (
            <p className={styles.listEmpty} role="status">
              {filtered
                ? "No conversation matches those filters."
                : "No conversations yet."}
            </p>
          ) : (
            <ul className={styles.threadList}>
              {visible.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/host/messages/${thread.id}`}
                    className={styles.thread}
                    aria-current={thread.id === activeId ? "page" : undefined}
                  >
                    <span className={styles.threadTop}>
                      <span className={styles.threadName}>
                        {thread.unread ? (
                          <>
                            <span className={styles.unreadDot} aria-hidden="true" />
                            <span className={styles.srOnly}>Unread. </span>
                          </>
                        ) : null}
                        {thread.applicantName}
                      </span>
                      <span className={styles.threadTime}>
                        {thread.updatedLabel}
                      </span>
                    </span>
                    <span className={styles.threadListing}>
                      {thread.listingTitle ?? "Listing no longer available"}
                    </span>
                    <span className={styles.threadPreview}>{thread.preview}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={styles.conversationPane} aria-label="Conversation">
        {active ? (
          <>
            <div className={styles.conversationHead}>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => router.push("/host/messages")}
              >
                <Icon name="action.back" size={16} aria-hidden />
                Threads
              </button>
              <div className={styles.conversationHeading}>
                <h2 className={styles.paneTitle}>{active.applicantName}</h2>
                <p className={styles.paneNote}>
                  {active.listingTitle ?? "Listing no longer available"}
                </p>
              </div>
              <button
                type="button"
                className={styles.contextToggle}
                aria-expanded={contextOpen}
                onClick={() => setContextOpen((open) => !open)}
              >
                <Icon name="system.info" size={16} aria-hidden />
                Details
              </button>
            </div>

            <MessageTranscript
              initialMessages={initialMessages}
              conversationId={active.id}
              viewerType="host"
              counterpartName={active.applicantName}
              replyPlaceholder={`Message ${active.applicantName}…`}
              onSent={onSent}
            />
          </>
        ) : (
          <div className={styles.placeholder} role="status">
            <span className={styles.placeholderIcon}>
              <Icon name="nav.messages" size={24} aria-hidden />
            </span>
            <h2 className={styles.placeholderTitle}>Pick a conversation</h2>
            <p className={styles.placeholderBody}>
              Threads stay attached to the application they started from, so the
              answer you give lives beside the candidate it was about.
            </p>
          </div>
        )}
      </section>

      {active ? (
        <aside
          className={styles.contextPane}
          data-open={contextOpen ? "true" : "false"}
          aria-label="Conversation context"
        >
          <h2 className={styles.paneTitle}>Context</h2>
          <dl className={styles.contextList}>
            <div className={styles.contextRow}>
              <dt className={styles.contextTerm}>Candidate</dt>
              <dd className={styles.contextValue}>{active.applicantName}</dd>
            </div>
            <div className={styles.contextRow}>
              <dt className={styles.contextTerm}>Role</dt>
              <dd className={styles.contextValue}>
                {active.listingTitle ?? "Listing no longer available"}
              </dd>
            </div>
            <div className={styles.contextRow}>
              <dt className={styles.contextTerm}>Last activity</dt>
              <dd className={styles.contextValue}>{active.updatedLabel}</dd>
            </div>
          </dl>

          <div className={styles.contextLinks}>
            {active.applicationId ? (
              <Link
                className={styles.contextLink}
                href={`/host/applicants/${active.applicationId}`}
              >
                <Icon name="nav.seekers" size={16} aria-hidden />
                Open the application
              </Link>
            ) : null}
            {active.listingId ? (
              <Link
                className={styles.contextLink}
                href={`/host/listings/${active.listingId}`}
              >
                <Icon name="category.mix" size={16} aria-hidden />
                Open the listing
              </Link>
            ) : null}
          </div>

          {/*
            Said plainly rather than left to be discovered. A host who expects an
            archive is better served by being told the product has none than by
            hunting for a control that was never built.
          */}
          <p className={styles.contextNote}>
            Conversations are never archived or deleted here — the thread stays
            with the application for the whole season.
          </p>
        </aside>
      ) : null}
    </div>
  );
}
