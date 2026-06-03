import {
  HOST_PROFILE,
  HostProfilePanel,
  HostSectionHeading,
} from "../../../../components/host";
import styles from "./page.module.css";

export default function HostProfilePage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Host profile"
        description="How seekers see you across the marketplace."
      />
      <HostProfilePanel profile={HOST_PROFILE} />
    </section>
  );
}
