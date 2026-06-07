"use client";

import { useState, useTransition } from "react";
import { Badge, Button } from "@explore-and-earn/ui";

import { unverifyHostAction, verifyHostAction } from "../../app/actions/admin";
import { attestationVariant, humanizeToken } from "./status";
import styles from "./AdminTable.module.css";

export interface AdminHostRowView {
  readonly id: string;
  readonly companyName: string;
  readonly clerkUserId: string;
  readonly attestationStatus: string;
  readonly listingCount: number;
}

export function AdminHostsTable({
  hosts,
}: {
  readonly hosts: ReadonlyArray<AdminHostRowView>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col">Clerk user ID</th>
              <th scope="col">Attestation status</th>
              <th scope="col">Listings</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {hosts.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={5}>
                  No host profiles yet.
                </td>
              </tr>
            ) : (
              hosts.map((host) => {
                const busy = isPending && pendingId === host.id;
                const verified = host.attestationStatus === "verified";
                return (
                  <tr key={host.id}>
                    <td>{host.companyName || "\u2014"}</td>
                    <td>
                      <span className={styles.mono}>
                        {host.clerkUserId || "\u2014"}
                      </span>
                    </td>
                    <td>
                      <Badge
                        label={humanizeToken(host.attestationStatus)}
                        variant={attestationVariant(host.attestationStatus)}
                      />
                    </td>
                    <td>{host.listingCount}</td>
                    <td>
                      <div className={styles.actions}>
                        <Button
                          variant="primary"
                          disabled={busy || verified}
                          onClick={() =>
                            runAction(host.id, () => verifyHostAction(host.id))
                          }
                        >
                          Verify
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy || !verified}
                          onClick={() =>
                            runAction(host.id, () =>
                              unverifyHostAction(host.id),
                            )
                          }
                        >
                          Unverify
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
