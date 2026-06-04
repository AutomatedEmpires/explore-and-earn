import {
  HOST_THREADS,
  HostSectionHeading,
  HostThreadGroups,
} from "../../../../components/host";
import styles from "./page.module.css";

export default function HostMessagesPage() {
  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Messages"
        description="Conversations with applicants and confirmed crew, unread first."
      />
      <HostThreadGroups threads={HOST_THREADS} />
    </section>
  );
}
