import {
  HOST_APPLICANTS,
  HostApplicantCard,
  HostSectionHeading,
} from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import styles from "./page.module.css";

export default function HostApplicantsPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Applicants"
        description="Review everyone who applied to your opportunities."
      />
      {HOST_APPLICANTS.length > 0 ? (
        <div className={styles.stack}>
          {HOST_APPLICANTS.map((applicant) => (
            <HostApplicantCard key={applicant.id} applicant={applicant} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No applicants yet"
          message="When seekers apply to your listings, they will appear here for review."
        />
      )}
    </section>
  );
}
