import type { Metadata } from "next";

import { HostHelpCenter } from "../../../../../components/host/HostHelpCenter";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Help & support",
  description:
    "Answers for hosts — posting, boosting, applicants, billing, and trust on Explore & Earn.",
};

export default function HostHelpPage() {
  return (
    <section className={styles.block}>
      <HostHelpCenter />
    </section>
  );
}
