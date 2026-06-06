"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";

import { updateHostProfileAction } from "../../app/actions/hostProfile";
import type { HostProfileSummary } from "./models";
import styles from "./HostProfileForm.module.css";

export interface HostProfileFormProps {
  readonly profile: HostProfileSummary;
}

/**
 * Map db-layer error codes to short, human-readable status text. Unknown codes
 * fall back to a generic failure message so we never surface a raw SQLSTATE or
 * PostgREST message to the host.
 */
const ERROR_TEXT: Record<string, string> = {
  name_required: "Organization name is required.",
  unauthenticated: "You must be signed in to save your profile.",
};

/**
 * Host profile edit form. Submits the fields backed by real `host_profiles`
 * columns (`company_name`, `primary_location_name`, `about`) via
 * `updateHostProfileAction`. Host name and tagline have no backing column yet,
 * so they are shown read-only and are not submitted. Verified status is shown
 * read-only — host verification is a trust signal owned by the (founder-gated)
 * verification flow, not a self-served toggle.
 */
export function HostProfileForm({ profile }: HostProfileFormProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fields = {
      companyName: String(formData.get("orgName") ?? ""),
      primaryLocationName: String(formData.get("location") ?? ""),
      about: String(formData.get("bio") ?? ""),
    };
    setMessage(null);
    startTransition(async () => {
      const result = await updateHostProfileAction(fields);
      setMessage(
        result.ok
          ? { ok: true, text: "Profile saved." }
          : {
              ok: false,
              text: ERROR_TEXT[result.error ?? ""] ?? "Could not save your profile.",
            },
      );
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
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
            readOnly
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
          readOnly
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
        <button className={styles.submit} type="submit" disabled={isPending}>
          <Icon name="action.forward" size={20} aria-hidden />
          <span>{isPending ? "Saving\u2026" : "Save changes"}</span>
        </button>
        <Link className={styles.cancel} href="/host/profile">
          Cancel
        </Link>
      </div>

      {message ? (
        <p
          className={message.ok ? styles.success : styles.error}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
