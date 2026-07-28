"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { HostApplicantCard } from "./HostApplicantCard";
import { HostPipelineBoard } from "./HostPipelineBoard";
import {
  APPLICANT_STAGE_LABEL,
  APPLICANT_STAGE_ORDER,
  countByStage,
  type ApplicantStage,
  type HostApplicantItem,
} from "./models";
import styles from "./HostApplicantWorkspace.module.css";

/**
 * The applicant surface, in the two shapes a host actually works in (spec §7).
 *
 * PIPELINE is for triage: everyone at once, grouped by where they are, so the
 * question "what is the shape of this season" has a picture. LIST is for search:
 * one column, filterable and sortable, for "the person from Bozeman who has a
 * boat licence".
 *
 * The mode is client state rather than a URL parameter deliberately — the page
 * is a force-dynamic render of the host's own applications and there is nothing
 * to refetch, so a round trip to change a layout would be a slower way to do
 * nothing.
 *
 * STAGE MOVES ARE NOT HANDLED HERE. Every card's controls call the same server
 * action as before, and `legalCardActions` renders only the edges
 * APPLICATION_TRANSITIONS permits from the row's CURRENT stored status. The
 * board has no drag-and-drop for exactly that reason: a drop target cannot
 * express an illegal edge, so it would offer moves the database will refuse.
 */

type Mode = "pipeline" | "list";

type SortId = "recent" | "match" | "name" | "stage";

const SORT_LABEL: Record<SortId, string> = {
  recent: "Newest applications",
  match: "Best match first",
  name: "Name (A–Z)",
  stage: "Pipeline order",
};

export interface HostApplicantWorkspaceProps {
  readonly applicants: readonly HostApplicantItem[];
  /** Listings to offer in the filter — the host's own, title keyed by id. */
  readonly listings: readonly { readonly id: string; readonly title: string }[];
  /** True when the plan includes the match reading (ADR-039 'full' scope). */
  readonly showMatch: boolean;
}

export function HostApplicantWorkspace({
  applicants,
  listings,
  showMatch,
}: HostApplicantWorkspaceProps) {
  const [mode, setMode] = useState<Mode>("pipeline");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<ApplicantStage | "all">("all");
  const [listingId, setListingId] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortId>("recent");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return applicants.filter((applicant) => {
      if (stage !== "all" && applicant.stage !== stage) return false;
      if (listingId !== "all" && applicant.listing.id !== listingId) return false;
      if (!needle) return true;
      return [applicant.applicantName, applicant.listing.title, applicant.listing.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [applicants, listingId, query, stage]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    switch (sort) {
      case "match":
        // Unscored candidates sort last, never as a zero: no score is not a bad
        // score, and ranking them as one would bury people the engine has simply
        // not looked at yet.
        rows.sort((a, b) => {
          const left = a.matchScore ?? -1;
          const right = b.matchScore ?? -1;
          return right - left;
        });
        break;
      case "name":
        rows.sort((a, b) => a.applicantName.localeCompare(b.applicantName));
        break;
      case "stage":
        rows.sort(
          (a, b) =>
            APPLICANT_STAGE_ORDER.indexOf(a.stage) -
            APPLICANT_STAGE_ORDER.indexOf(b.stage),
        );
        break;
      default:
        break; // incoming order is submitted_at desc
    }
    return rows;
  }, [filtered, sort]);

  const counts = countByStage(filtered);
  const filtersActive = query.trim() !== "" || stage !== "all" || listingId !== "all";

  function clearFilters() {
    setQuery("");
    setStage("all");
    setListingId("all");
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.bar}>
        <div className={styles.modes} role="tablist" aria-label="Applicant view">
          {(["pipeline", "list"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={styles.mode}
              data-active={mode === id ? "true" : undefined}
              onClick={() => setMode(id)}
            >
              <Icon name={id === "pipeline" ? "action.sort" : "nav.seekers"} size={16} aria-hidden />
              {id === "pipeline" ? "Pipeline" : "List"}
            </button>
          ))}
        </div>

        <div className={styles.search}>
          <Icon name="nav.seek" size={18} aria-hidden />
          <input
            type="search"
            className={styles.searchInput}
            value={query}
            placeholder="Search candidates by name, role, or place"
            aria-label="Search candidates"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.filters}>
        <label className={styles.filter}>
          <span className={styles.filterLabel}>Stage</span>
          <select
            className={styles.select}
            value={stage}
            onChange={(event) => setStage(event.target.value as ApplicantStage | "all")}
          >
            <option value="all">All stages ({applicants.length})</option>
            {APPLICANT_STAGE_ORDER.map((id) => (
              <option key={id} value={id}>
                {APPLICANT_STAGE_LABEL[id]} ({counts[id]})
              </option>
            ))}
          </select>
        </label>

        {listings.length > 1 ? (
          <label className={styles.filter}>
            <span className={styles.filterLabel}>Listing</span>
            <select
              className={styles.select}
              value={listingId}
              onChange={(event) => setListingId(event.target.value)}
            >
              <option value="all">All listings</option>
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className={styles.filter}>
          <span className={styles.filterLabel}>Sort</span>
          <select
            className={styles.select}
            value={sort}
            onChange={(event) => setSort(event.target.value as SortId)}
          >
            {(Object.keys(SORT_LABEL) as SortId[]).map((id) => (
              // Sorting by match is meaningless without the reading, so the
              // option is withheld on the basic scope rather than shown inert.
              id === "match" && !showMatch ? null : (
                <option key={id} value={id}>
                  {SORT_LABEL[id]}
                </option>
              )
            ))}
          </select>
        </label>

        {filtersActive ? (
          <button type="button" className={styles.clear} onClick={clearFilters}>
            Clear filters
            <Icon name="action.close" size={14} aria-hidden />
          </button>
        ) : null}
      </div>

      <p className={styles.resultCount} role="status">
        {sorted.length} of {applicants.length}{" "}
        {applicants.length === 1 ? "candidate" : "candidates"}
      </p>

      {sorted.length === 0 ? (
        <div className={styles.noResults}>
          <p className={styles.noResultsTitle}>No candidates match these filters</p>
          <div className={styles.noResultsActions}>
            <button type="button" className={styles.noResultsBtn} onClick={clearFilters}>
              Clear filters
            </button>
            <Link className={styles.noResultsBtn} href="/host/outreach">
              Invite seekers instead
            </Link>
          </div>
        </div>
      ) : mode === "pipeline" ? (
        <HostPipelineBoard applicants={sorted} showMatch={showMatch} />
      ) : (
        <ul className={styles.list}>
          {sorted.map((applicant) => (
            <li key={applicant.id}>
              <HostApplicantCard applicant={applicant} showMatch={showMatch} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
