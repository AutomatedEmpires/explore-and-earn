import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";

import type { HostProfileSummary } from "./models";
import styles from "./HostProfilePanel.module.css";

export interface HostProfilePanelProps {
  readonly profile: HostProfileSummary;
}

export function HostProfilePanel({ profile }: HostProfilePanelProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden>
          <Icon name="nav.profile" size={24} aria-hidden />
        </span>
        <div className={styles.identity}>
          <span className={styles.name}>{profile.orgName}</span>
          <span className={styles.contact}>Hosted by {profile.hostName}</span>
          {profile.verified ? <VerifiedHostBadge /> : null}
        </div>
      </header>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Active listings</dt>
          <dd className={styles.factValue}>{profile.activeListings}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Total applicants</dt>
          <dd className={styles.factValue}>{profile.totalApplicants}</dd>
        </div>
      </dl>
    </section>
  );
}
