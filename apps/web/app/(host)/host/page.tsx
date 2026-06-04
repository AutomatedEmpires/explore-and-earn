import {
  HOST_APPLICANTS,
  HOST_LISTINGS,
  HOST_PROFILE,
  HOST_THREADS,
  HostApplicantCard,
  HostListingCard,
  HostSectionHeading,
  HostStatStrip,
  deriveHostStats,
} from "../../../components/host";
import { EmptyState } from "../../../components/discovery";
import styles from "./page.module.css";

export default function HostDashboardPage() {
  const stats = deriveHostStats(HOST_LISTINGS, HOST_APPLICANTS, HOST_THREADS);
  const newApplicants = HOST_APPLICANTS.filter(
    (applicant) => applicant.stage === "new",
  );
  const previewListings = HOST_LISTINGS.slice(0, 2);

  return (
    <>
      <section className={styles.block}>
        <HostSectionHeading
          title={`Welcome back, ${HOST_PROFILE.hostName}`}
          description="Your hosting command center — listings, applicants, and messages at a glance."
        />
        <HostStatStrip stats={stats} />
      </section>

      <section className={styles.block}>
        <HostSectionHeading
          title="Your listings"
          description="Track status and applicant volume across your opportunities."
          actionLabel="All listings"
          actionHref="/host/listings"
        />
        <div className={styles.stack}>
          {previewListings.map((item) => (
            <HostListingCard key={item.listing.id} item={item} />
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <HostSectionHeading
          title="New applicants"
          description="People who just applied and are waiting on your first review."
          actionLabel="All applicants"
          actionHref="/host/applicants"
        />
        {newApplicants.length > 0 ? (
          <div className={styles.stack}>
            {newApplicants.map((applicant) => (
              <HostApplicantCard key={applicant.id} applicant={applicant} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="You are all caught up"
            message="No new applicants are waiting on a first review right now."
          />
        )}
      </section>
    </>
  );
}
