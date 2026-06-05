import { HostSectionHeading } from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import styles from "./page.module.css";

/**
 * Applicants pipeline. The real applications query + persisted Application
 * object model are being built in parallel (next backend PR); until that lands
 * this surface shows a clean "coming soon" empty state rather than fixtures, so
 * nothing implies a working pipeline that does not exist yet.
 */
export default function HostApplicantsPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Applicants"
        description="Your applicant pipeline, grouped by stage. Review only — moving applicants between stages activates with the hiring pipeline."
      />
      <EmptyState
        title="Applicant management coming soon"
        message="The live applicant pipeline is being wired up. Once seekers can apply to your listings, their applications will appear here for review."
      />
    </section>
  );
}
