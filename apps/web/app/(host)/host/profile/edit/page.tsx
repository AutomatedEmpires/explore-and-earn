import {
  HOST_PROFILE,
  HostProfileForm,
  HostSectionHeading,
} from "../../../../../components/host";
import styles from "./page.module.css";

export default function HostProfileEditPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Edit profile"
        description="Update how seekers see you across the marketplace."
        actionLabel="Back to profile"
        actionHref="/host/profile"
      />
      <HostProfileForm profile={HOST_PROFILE} />
    </section>
  );
}
