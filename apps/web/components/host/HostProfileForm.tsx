import Link from "next/link";
import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";

import type { HostProfileSummary } from "./models";
import styles from "./HostProfileForm.module.css";

export interface HostProfileFormProps {
  readonly profile: HostProfileSummary;
}

/**
 * Host profile edit form. UI-only and presentational: there is NO submission,
 * persistence, or backend wiring (the host account/profile data layer is
 * founder-gated). Fields are uncontrolled with the current profile as defaults
 * so layout and a11y can be reviewed ahead of the real save flow. Verified
 * status is shown read-only — host verification is a trust signal owned by the
 * (founder-gated) verification flow, not a self-served toggle.
 */
export function HostProfileForm({ profile }: HostProfileFormProps) {
  return (
    <form className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="profile-org">
          Organization name
        </label>
        <input
          className={styles.input}
          id="profile-org"
          name="orgName"
          type="text"
          defaultValue={profile.orgName}
          placeholder="Wenatchee Orchard Co."
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-host">
            Host name
          </label>
          <input
            className={styles.input}
            id="profile-host"
            name="hostName"
            type="text"
            defaultValue={profile.hostName}
            placeholder="Maya"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-location">
            Location
          </label>
          <input
            className={styles.input}
            id="profile-location"
            name="location"
            type="text"
            defaultValue={profile.location ?? ""}
            placeholder="Wenatchee, WA"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="profile-tagline">
          Tagline
        </label>
        <input
          className={styles.input}
          id="profile-tagline"
          name="tagline"
          type="text"
          defaultValue={profile.tagline ?? ""}
          placeholder="Family orchard hiring seasonal crews since 1998."
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="profile-bio">
          About
        </label>
        <textarea
          className={styles.textarea}
          id="profile-bio"
          name="bio"
          rows={4}
          defaultValue={profile.bio ?? ""}
          placeholder="Tell seekers about your farm, crew, and what a season looks like."
        />
      </div>

      <div className={styles.verification}>
        <div className={styles.verificationText}>
          <span className={styles.label}>Verification</span>
          {profile.verified ? (
            <VerifiedHostBadge />
          ) : (
            <span className={styles.note}>Not yet verified.</span>
          )}
        </div>
        <p className={styles.note}>
          Verification is managed by the trust team and cannot be edited here.
        </p>
      </div>

      <div className={styles.actions}>
        <button className={styles.submit} type="button">
          <Icon name="action.forward" size={20} aria-hidden />
          <span>Save changes</span>
        </button>
        <Link className={styles.cancel} href="/host/profile">
          Cancel
        </Link>
      </div>

      <p className={styles.note}>
        This is a UI preview. Saving activates when the host profile data layer lands.
      </p>
    </form>
  );
}
