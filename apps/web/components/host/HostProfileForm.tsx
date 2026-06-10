"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";
import { uploadProfilePhoto } from "@explore-and-earn/db/client";

import { ImageUpload } from "../ImageUpload";
import { updateHostProfileAction } from "../../app/actions/hostProfile";
import type { HostProfileSummary } from "./models";
import styles from "./HostProfileForm.module.css";

export interface HostProfileFormProps {
  readonly profile: HostProfileSummary;
  readonly hostProfileId?: string;
  readonly photoUrl?: string;
}

const ERROR_TEXT: Record<string, string> = {
  name_required: "Organization name is required.",
  unauthenticated: "You must be signed in to save your profile.",
};

export function HostProfileForm({
  profile,
  hostProfileId,
  photoUrl: initialPhotoUrl,
}: HostProfileFormProps) {
  const { getToken } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl ?? "");
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

  async function uploadPhoto(file: File): Promise<string> {
    if (!hostProfileId) {
      throw new Error("Missing host profile — reload the page and try again.");
    }
    const token = await getToken({ template: "supabase" });
    if (!token) {
      throw new Error("Your session has expired — sign in again.");
    }
    return uploadProfilePhoto(token, hostProfileId, file, "host");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const instagram = String(formData.get("instagram") ?? "").trim().replace(/^@/, "");
    const twitter = String(formData.get("twitter") ?? "").trim().replace(/^@/, "");

    const fields = {
      companyName: String(formData.get("orgName") ?? ""),
      hostName: String(formData.get("hostName") ?? "") || null,
      tagline: String(formData.get("tagline") ?? "") || null,
      primaryLocationName: String(formData.get("location") ?? "") || null,
      about: String(formData.get("bio") ?? "") || null,
      photoUrl: photoUrl.length > 0 ? photoUrl : null,
      websiteUrl: String(formData.get("websiteUrl") ?? "") || null,
      socialLinks: {
        instagram: instagram || null,
        twitter: twitter || null,
      },
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
      {hostProfileId ? (
        <div className={styles.field}>
          <span className={styles.label}>Profile photo</span>
          <ImageUpload
            label="Add a profile photo"
            currentUrl={photoUrl || undefined}
            uploader={uploadPhoto}
            onUpload={setPhotoUrl}
            disabled={isPending}
          />
        </div>
      ) : null}

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

      <div className={styles.fieldGroup}>
        <p className={styles.fieldGroupHeading}>Links</p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-website">
            Website
          </label>
          <input
            className={styles.input}
            id="profile-website"
            name="websiteUrl"
            type="url"
            defaultValue={profile.websiteUrl ?? ""}
            placeholder="https://yourfarm.com"
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-instagram">
              Instagram
            </label>
            <div className={styles.inputPrefix}>
              <span className={styles.prefix}>@</span>
              <input
                className={`${styles.input} ${styles.inputWithPrefix}`}
                id="profile-instagram"
                name="instagram"
                type="text"
                defaultValue={profile.instagram ?? ""}
                placeholder="yourhandle"
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-twitter">
              X (Twitter)
            </label>
            <div className={styles.inputPrefix}>
              <span className={styles.prefix}>@</span>
              <input
                className={`${styles.input} ${styles.inputWithPrefix}`}
                id="profile-twitter"
                name="twitter"
                type="text"
                defaultValue=""
                placeholder="yourhandle"
              />
            </div>
          </div>
        </div>
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
          <span>{isPending ? "Saving…" : "Save changes"}</span>
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
