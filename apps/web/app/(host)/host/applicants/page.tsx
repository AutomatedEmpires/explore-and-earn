import {
  HOST_APPLICANTS,
  HostPipelineBoard,
  HostSectionHeading,
} from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import styles from "./page.module.css";

export default function HostApplicantsPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Applicants"
        description="Your applicant pipeline, grouped by stage. Review only — moving applicants between stages activates with the hiring pipeline."
      />
      {HOST_APPLICANTS.length > 0 ? (
        <HostPipelineBoard applicants={HOST_APPLICANTS} />
      ) : (
        <EmptyState
          title="No applicants yet"
          message="When seekers apply to your listings, they will appear here for review."
        />
      )}
    </section>
  );
}
