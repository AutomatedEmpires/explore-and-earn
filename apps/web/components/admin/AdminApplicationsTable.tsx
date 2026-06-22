import { Badge } from "@explore-and-earn/ui";

import { formatAdminDate, humanizeToken } from "./status";
import styles from "./AdminTable.module.css";

export interface AdminApplicationRowView {
  readonly id: string;
  readonly seekerClerkUserId: string;
  readonly listingTitle: string;
  readonly status: string;
  readonly createdAt: string;
}

/** Read-only recent-applications table (no actions — observation only). */
export function AdminApplicationsTable({
  applications,
}: {
  readonly applications: ReadonlyArray<AdminApplicationRowView>;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Seeker (Clerk ID)</th>
              <th scope="col">Listing title</th>
              <th scope="col">Status</th>
              <th scope="col">Applied at</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={4}>
                  No applications yet.
                </td>
              </tr>
            ) : (
              applications.map((application) => (
                <tr key={application.id}>
                  <td data-label="Seeker">
                    <span className={styles.mono}>
                      {application.seekerClerkUserId || "\u2014"}
                    </span>
                  </td>
                  <td data-label="Listing">{application.listingTitle || "\u2014"}</td>
                  <td data-label="Status">
                    <Badge label={humanizeToken(application.status)} />
                  </td>
                  <td data-label="Applied">{formatAdminDate(application.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
