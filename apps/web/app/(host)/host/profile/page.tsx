import {
  HOST_APPLICANTS,
  HOST_LISTINGS,
  HOST_PROFILE,
  HOST_THREADS,
  HostProfilePanel,
  HostSectionHeading,
  deriveHostStats,
} from "../../../../components/host";
import styles from "./page.module.css";

export default function HostProfilePage() {
  const stats = deriveHostStats(HOST_LISTINGS, HOST_APPLICANTS, HOST_THREADS);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Host profile"
        description="How seekers see you across the marketplace."
      />
      <HostProfilePanel profile={HOST_PROFILE} stats={stats} />
    </section>
  );
}
