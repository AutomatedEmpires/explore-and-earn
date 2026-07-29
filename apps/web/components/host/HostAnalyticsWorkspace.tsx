"use client";

import { useMemo, useState } from "react";
import { Icon } from "@explore-and-earn/ui";
import type { HostAnalytics } from "@explore-and-earn/db";

import { captureFunnelEvent } from "../../lib/analytics/capture";
import { HOST_WORKSPACE_EVENTS } from "../../lib/analytics/events";
import { buildCsv, downloadCsv } from "../../lib/csv";
import { HostAnalyticsDashboard } from "./HostAnalyticsDashboard";
import styles from "./HostAnalyticsWorkspace.module.css";

/**
 * The analytics workspace chrome (V2 D25).
 *
 * WHAT THE DATA LAYER SUPPORTS DECIDED WHAT CONTROLS EXIST, and the absences
 * are as deliberate as the presences:
 *
 *   · NO DATE RANGE. `getHostAnalytics(token, userId)` takes no window and its
 *     queries carry no temporal predicate — every figure it returns is all-time.
 *     A range picker over that data would filter nothing while implying it had.
 *     The header says so in one sentence instead.
 *
 *   · A LISTING FILTER, because `perListingStats` really is per listing. It is
 *     applied here rather than in SQL: the rows are already loaded and already
 *     scoped to this host, so a round trip would buy nothing. The account-wide
 *     totals are LEFT ALONE when a listing is selected and the panel says they
 *     are — narrowing them would require per-listing figures the object does
 *     not carry for every stage, and quietly reusing the listing's numbers as
 *     the account's is the kind of error nobody catches by looking.
 *
 *   · A CSV EXPORT of the real per-listing table. No aggregation, no rounding,
 *     no invented columns — the same numbers the table above shows.
 */

export interface HostAnalyticsWorkspaceProps {
  readonly analytics: HostAnalytics;
}

const ALL = "all";

export function HostAnalyticsWorkspace({ analytics }: HostAnalyticsWorkspaceProps) {
  const [listingId, setListingId] = useState<string>(ALL);

  const canFilter = analytics.perListingStats.length > 1;
  const selected = listingId === ALL ? null : listingId;

  const scoped = useMemo<HostAnalytics>(() => {
    if (!selected) return analytics;
    return {
      ...analytics,
      perListingStats: analytics.perListingStats.filter(
        (stat) => stat.listingId === selected,
      ),
    };
  }, [analytics, selected]);

  function changeListing(next: string) {
    setListingId(next);
    captureFunnelEvent(HOST_WORKSPACE_EVENTS.analyticsFilterUsed, {
      filter: "listing",
      scoped: next !== ALL,
    });
  }

  function exportCsv() {
    const rows = analytics.perListingStats.map((stat) => [
      stat.listingTitle,
      stat.listingStatus,
      stat.totalApplications,
      stat.applicationsByStatus.applied ?? 0,
      stat.applicationsByStatus.reviewing ?? 0,
      stat.applicationsByStatus.saved_by_host ?? 0,
      stat.applicationsByStatus.offered ?? 0,
      stat.applicationsByStatus.accepted ?? 0,
      stat.applicationsByStatus.not_selected ?? 0,
      stat.applicationsByStatus.withdrawn ?? 0,
      stat.invitesSent,
      stat.invitesAccepted,
    ]);
    const csv = buildCsv(
      [
        "Listing",
        "Status",
        "Applications",
        "Applied",
        "Reviewing",
        "Saved",
        "Offered",
        "Accepted",
        "Not selected",
        "Withdrawn",
        "Invites sent",
        "Invites accepted",
      ],
      rows,
    );
    downloadCsv("explore-and-earn-listing-analytics.csv", csv);
    captureFunnelEvent(HOST_WORKSPACE_EVENTS.analyticsFilterUsed, {
      filter: "export_csv",
      rows: rows.length,
    });
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.controls}>
        <p className={styles.window}>
          <Icon name="system.info" size={16} aria-hidden />
          All-time figures. Nothing in the data layer is bucketed by date yet,
          so there is no period to choose and no trend line to draw.
        </p>

        <div className={styles.controlRow}>
          {canFilter ? (
            <label className={styles.selectLabel}>
              <span className={styles.selectText}>Listing</span>
              <select
                className={styles.select}
                value={listingId}
                onChange={(event) => changeListing(event.target.value)}
              >
                <option value={ALL}>Every listing</option>
                {analytics.perListingStats.map((stat) => (
                  <option key={stat.listingId} value={stat.listingId}>
                    {stat.listingTitle}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {analytics.perListingStats.length > 0 ? (
            <button type="button" className={styles.exportBtn} onClick={exportCsv}>
              <Icon name="action.download" size={16} aria-hidden />
              Export listings as CSV
            </button>
          ) : null}
        </div>

        {selected ? (
          <p className={styles.scopeNote} role="status">
            Showing one listing below. The four headline tiles stay account-wide
            — the data layer does not break them down per role.
          </p>
        ) : null}
      </div>

      <HostAnalyticsDashboard analytics={scoped} />
    </div>
  );
}
