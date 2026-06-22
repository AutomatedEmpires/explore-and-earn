"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@explore-and-earn/ui";

import {
  approveListingAction,
  rejectListingAction,
} from "../../app/actions/admin";
import { formatAdminDate, humanizeToken, listingStatusVariant } from "./status";
import styles from "./AdminTable.module.css";

export interface AdminListingRowView {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly status: string;
  readonly publishedAt: string | null;
  readonly hostCompanyName: string;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "under_review", label: "Under Review" },
  { id: "live", label: "Live" },
  { id: "draft", label: "Draft" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function AdminListingsTable({
  listings,
}: {
  readonly listings: ReadonlyArray<AdminListingRowView>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterId>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      filter === "all"
        ? listings
        : listings.filter((listing) => listing.status === filter),
    [filter, listings],
  );

  function runAction(
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await action();
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className={styles.wrap}>
      <div
        className={styles.tabs}
        role="group"
        aria-label="Filter listings by status"
      >
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={styles.tab}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Host</th>
              <th scope="col">Title</th>
              <th scope="col">Category</th>
              <th scope="col">Status</th>
              <th scope="col">Published at</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={6}>
                  No listings in this view.
                </td>
              </tr>
            ) : (
              visible.map((listing) => {
                const busy = isPending && pendingId === listing.id;
                return (
                  <tr key={listing.id}>
                    <td data-label="Host">{listing.hostCompanyName}</td>
                    <td data-label="Title">{listing.title}</td>
                    <td data-label="Category">{humanizeToken(listing.category)}</td>
                    <td data-label="Status">
                      <Badge
                        label={humanizeToken(listing.status)}
                        variant={listingStatusVariant(listing.status)}
                      />
                    </td>
                    <td data-label="Published">{formatAdminDate(listing.publishedAt)}</td>
                    <td data-label="Actions">
                      <div className={styles.actions}>
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            runAction(listing.id, () =>
                              approveListingAction(listing.id),
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            runAction(listing.id, () =>
                              rejectListingAction(listing.id),
                            )
                          }
                        >
                          Reject
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            router.push(`/admin/listings/${listing.id}`)
                          }
                        >
                          Review
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
