import {
  HOST_THREADS,
  HostSectionHeading,
  HostThreadList,
} from "../../../../components/host";
import styles from "./page.module.css";

export default function HostMessagesPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Messages"
        description="Stay in touch with applicants and confirmed crew."
      />
      <HostThreadList threads={HOST_THREADS} />
    </section>
  );
}
