"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";

import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";
import {
  uploadProfilePhoto,
} from "@explore-and-earn/db/client";
import {
  HOUSING_PHOTO_ROLES,
  MARKETPLACE_LANES,
  SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES,
  housingPhotoLabel,
  type HostBenefitLibrary,
  type HousingPhotoMap,
  type HousingPhotoRole,
  type MarketplaceLane,
} from "@explore-and-earn/contracts";

import { ImageUpload } from "../ImageUpload";
import {
  updateHostProfileAction,
  uploadHousingLibraryPhotoAction,
} from "../../app/actions/hostProfile";
import type { HostProfileSummary } from "./models";
import { useOptionalGetToken } from "../../lib/useOptionalGetToken";
import {
  buildHostBenefitLibraryPatch,
  canManageHostBenefitLibrary,
} from "./hostProfileBenefitLibrary";
import styles from "./HostProfileForm.module.css";

export interface HostProfileFormProps {
  readonly profile: HostProfileSummary;
  readonly hostProfileId?: string;
  readonly photoUrl?: string;
  readonly benefitLibraryAvailable?: boolean;
  readonly benefitLibrary?: HostBenefitLibrary;
}

const ERROR_TEXT: Record<string, string> = {
  name_required: "Organization name is required.",
  unauthenticated: "You must be signed in to save your profile.",
  invalid_housing_photo: "A housing photo is not in your reusable library.",
  housing_photo_in_use:
    "That photo is supporting a published listing. Add a listing override or pause the listing before removing it.",
};

function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function isMarketplaceLane(category: string): category is MarketplaceLane {
  return (MARKETPLACE_LANES as readonly string[]).includes(category);
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function teamLines(value: FormDataEntryValue | null) {
  return lines(value).map((entry) => {
    const [name = "", ...roleParts] = entry.split(/\s+(?:—|-|\|)\s+/);
    return { name: name.trim(), role: roleParts.join(" — ").trim() };
  });
}

interface EditableFaq {
  readonly key: string;
  readonly question: string;
  readonly answer: string;
}

export function HostProfileForm({
  profile,
  hostProfileId,
  photoUrl: initialPhotoUrl,
  benefitLibraryAvailable = false,
  benefitLibrary,
}: HostProfileFormProps) {
  const getToken = useOptionalGetToken();
  const [isPending, startTransition] = useTransition();
  const [uploadingCount, setUploadingCount] = useState(0);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl ?? "");
  const [housingPhotos, setHousingPhotos] = useState<HousingPhotoMap>(() => ({
    ...(benefitLibrary?.housing?.photos ?? {}),
  }));
  const showBenefitLibrary = canManageHostBenefitLibrary(
    hostProfileId,
    benefitLibraryAvailable,
  );
  const [housingOffered, setHousingOffered] = useState(
    profile.housingOfferedGenerally ?? false,
  );
  const [mealsOffered, setMealsOffered] = useState(
    profile.mealsOfferedGenerally ?? false,
  );
  const [categoryScopes, setCategoryScopes] = useState<MarketplaceLane[]>(() =>
    Array.from(new Set((profile.categoryScopes ?? []).filter(isMarketplaceLane))),
  );
  const [faqs, setFaqs] = useState<EditableFaq[]>(() =>
    (profile.faqs ?? []).map((faq, index) => ({
      key: `saved-${index}`,
      question: faq.question,
      answer: faq.answer,
    })),
  );
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

  function toggleCategory(cat: MarketplaceLane) {
    setCategoryScopes((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function addFaq() {
    setFaqs((current) =>
      current.length >= 12
        ? current
        : [
            ...current,
            {
              key: `new-${Date.now()}-${current.length}`,
              question: "",
              answer: "",
            },
          ],
    );
  }

  function updateFaq(
    key: string,
    field: "question" | "answer",
    value: string,
  ) {
    setFaqs((current) =>
      current.map((faq) => (faq.key === key ? { ...faq, [field]: value } : faq)),
    );
  }

  async function uploadPhoto(file: File): Promise<string> {
    if (!hostProfileId) {
      throw new Error("Missing host profile — reload the page and try again.");
    }
    setUploadingCount((count) => count + 1);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your session has expired — sign in again.");
      }
      return await uploadProfilePhoto(token, hostProfileId, file, "host");
    } finally {
      setUploadingCount((count) => Math.max(0, count - 1));
    }
  }

  async function uploadHousingPhoto(
    role: HousingPhotoRole,
    file: File,
  ): Promise<string> {
    if (!hostProfileId) {
      throw new Error("Missing host profile — reload the page and try again.");
    }
    setUploadingCount((count) => count + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadHousingLibraryPhotoAction(role, formData);
      if (!result.ok || !result.url) {
        throw new Error(result.error ?? "Upload failed. Please try again.");
      }
      return result.url;
    } finally {
      setUploadingCount((count) => Math.max(0, count - 1));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadingCount > 0) {
      setMessage({ ok: false, text: "Wait for every photo to finish uploading." });
      return;
    }
    const formData = new FormData(event.currentTarget);

    const instagram = String(formData.get("instagram") ?? "").trim().replace(/^@/, "");
    const twitter = String(formData.get("twitter") ?? "").trim().replace(/^@/, "");
    const cleanFaqs = faqs.map(({ question, answer }) => ({
      question: question.trim(),
      answer: answer.trim(),
    }));
    if (cleanFaqs.some((faq) => Boolean(faq.question) !== Boolean(faq.answer))) {
      setMessage({
        ok: false,
        text: "Complete both the question and answer, or remove that FAQ.",
      });
      return;
    }

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
      housingOfferedGenerally: housingOffered,
      mealsOfferedGenerally: mealsOffered,
      categoryScopes,
      narrative: {
        whyWorkForUs: String(formData.get("whyWorkForUs") ?? "").trim() || undefined,
        team: teamLines(formData.get("team")),
        activities: lines(formData.get("activities")),
        perks: lines(formData.get("perks")),
        culture: lines(formData.get("culture")),
        managementApproach:
          String(formData.get("managementApproach") ?? "").trim() || undefined,
        typicalDay: String(formData.get("typicalDay") ?? "").trim() || undefined,
        workEnvironment:
          String(formData.get("workEnvironment") ?? "").trim() || undefined,
        seasonRhythm: lines(formData.get("seasonRhythm")),
        training: lines(formData.get("training")),
        transportation: lines(formData.get("transportation")),
        remoteness: String(formData.get("remoteness") ?? "").trim() || undefined,
        nearbyServices: lines(formData.get("nearbyServices")),
        housingDescription:
          String(formData.get("housingDescription") ?? "").trim() || undefined,
        mealsDescription:
          String(formData.get("mealsDescription") ?? "").trim() || undefined,
        faqs: cleanFaqs.filter((faq) => faq.question && faq.answer),
      },
      ...buildHostBenefitLibraryPatch(benefitLibraryAvailable, housingPhotos),
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
            disabled={isPending || uploadingCount > 0}
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
        <div>
          <p className={styles.fieldGroupHeading}>Public employer story</p>
          <p className={styles.note}>
            These fields map directly to the public employer profile. Leave a
            section empty to hide it rather than publishing placeholder copy.
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-why-work">
            Why work for us
          </label>
          <textarea
            className={styles.textarea}
            id="profile-why-work"
            name="whyWorkForUs"
            rows={5}
            maxLength={3000}
            defaultValue={profile.whyWorkForUs ?? ""}
            placeholder="Give seekers the clearest reason to choose a season with your team."
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-culture">
              Culture
            </label>
            <textarea
              className={styles.textarea}
              id="profile-culture"
              name="culture"
              rows={5}
              maxLength={3400}
              defaultValue={(profile.culture ?? []).join("\n")}
              placeholder={"Direct, respectful communication\nSafety before speed"}
            />
            <p className={styles.note}>One principle per line.</p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-management">
              Management approach
            </label>
            <textarea
              className={styles.textarea}
              id="profile-management"
              name="managementApproach"
              rows={5}
              maxLength={3000}
              defaultValue={profile.managementApproach ?? ""}
              placeholder="Explain scheduling, feedback, communication, and how managers support the crew."
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-typical-day">
              A typical day
            </label>
            <textarea
              className={styles.textarea}
              id="profile-typical-day"
              name="typicalDay"
              rows={5}
              maxLength={3000}
              defaultValue={profile.typicalDay ?? ""}
              placeholder="Walk through the rhythm from arrival to handoff and end of shift."
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-work-environment">
              Work environment
            </label>
            <textarea
              className={styles.textarea}
              id="profile-work-environment"
              name="workEnvironment"
              rows={5}
              maxLength={3000}
              defaultValue={profile.workEnvironment ?? ""}
              placeholder="Set honest expectations about pace, setting, physical demands, weather, and teamwork."
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-team">
            Team members
          </label>
          <textarea
            className={styles.textarea}
            id="profile-team"
            name="team"
            rows={4}
            maxLength={3000}
            defaultValue={(profile.team ?? [])
              .map((member) => `${member.name} — ${member.role}`)
              .join("\n")}
            placeholder={"Maya Chen — General Manager\nLuis Ortiz — Crew Lead"}
          />
          <p className={styles.note}>One person per line: name — role.</p>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-season-rhythm">
              Season rhythm
            </label>
            <textarea
              className={styles.textarea}
              id="profile-season-rhythm"
              name="seasonRhythm"
              rows={5}
              maxLength={4000}
              defaultValue={(profile.seasonRhythm ?? []).join("\n")}
              placeholder={"August — onboarding\nSeptember — peak weekends\nOctober — close-down"}
            />
            <p className={styles.note}>One milestone per line.</p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-training">
              Training &amp; growth
            </label>
            <textarea
              className={styles.textarea}
              id="profile-training"
              name="training"
              rows={5}
              maxLength={4000}
              defaultValue={(profile.training ?? []).join("\n")}
              placeholder={"Paid orientation\nRole shadowing\nEnd-of-season reference"}
            />
            <p className={styles.note}>One commitment per line.</p>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-activities">
              Life &amp; activities
            </label>
            <textarea
              className={styles.textarea}
              id="profile-activities"
              name="activities"
              rows={5}
              maxLength={4000}
              defaultValue={(profile.activities ?? []).join("\n")}
              placeholder={"Trail access\nCrew dinners\nLake days"}
            />
            <p className={styles.note}>One activity per line.</p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-perks">
              Perks &amp; benefits
            </label>
            <textarea
              className={styles.textarea}
              id="profile-perks"
              name="perks"
              rows={5}
              maxLength={4000}
              defaultValue={(profile.perks ?? []).join("\n")}
              placeholder={"Staff housing\nShift meals\nEnd-of-season bonus"}
            />
            <p className={styles.note}>One perk per line.</p>
          </div>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div>
          <p className={styles.fieldGroupHeading}>Location &amp; day-to-day</p>
          <p className={styles.note}>
            Help seekers understand how remote the location feels and how they
            can reach work, groceries, healthcare, and town.
          </p>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-remoteness">
            Remoteness &amp; access
          </label>
          <textarea
            className={styles.textarea}
            id="profile-remoteness"
            name="remoteness"
            rows={4}
            maxLength={2000}
            defaultValue={profile.remoteness ?? ""}
            placeholder="Describe the distance to town, whether staff live on-site, and what having a car changes."
          />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-transportation">
              Transportation
            </label>
            <textarea
              className={styles.textarea}
              id="profile-transportation"
              name="transportation"
              rows={5}
              maxLength={4000}
              defaultValue={(profile.transportation ?? []).join("\n")}
              placeholder={"Staff shuttle to town\nNearest airport and pickup options"}
            />
            <p className={styles.note}>One option per line.</p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-nearby-services">
              Nearby services
            </label>
            <textarea
              className={styles.textarea}
              id="profile-nearby-services"
              name="nearbyServices"
              rows={5}
              maxLength={4000}
              defaultValue={(profile.nearbyServices ?? []).join("\n")}
              placeholder={"Grocery store\nUrgent care\nPharmacy\nPublic library"}
            />
            <p className={styles.note}>One service per line.</p>
          </div>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <p className={styles.fieldGroupHeading}>What you offer</p>

        <div className={styles.field}>
          <span className={styles.label}>Categories you operate in</span>
          <div className={styles.chips} role="group" aria-label="Marketplace categories">
            {MARKETPLACE_LANES.map((cat) => {
              const active = categoryScopes.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                  aria-pressed={active}
                  onClick={() => toggleCategory(cat)}
                >
                  {categoryLabel(cat)}
                </button>
              );
            })}
          </div>
        </div>

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={housingOffered}
            onChange={(event) => setHousingOffered(event.target.checked)}
          />
          <span className={styles.toggleText}>
            <span className={styles.toggleTitle}>We generally provide housing</span>
            <span className={styles.toggleNote}>
              Shown on your public profile as a host-level promise to seekers.
            </span>
          </span>
        </label>

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={mealsOffered}
            onChange={(event) => setMealsOffered(event.target.checked)}
          />
          <span className={styles.toggleText}>
            <span className={styles.toggleTitle}>We generally provide meals</span>
            <span className={styles.toggleNote}>
              Shown on your public profile as a host-level promise to seekers.
            </span>
          </span>
        </label>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-housing-description">
              Housing overview
            </label>
            <textarea
              className={styles.textarea}
              id="profile-housing-description"
              name="housingDescription"
              rows={5}
              maxLength={2000}
              defaultValue={profile.housingDescription ?? ""}
              placeholder="Describe the usual housing setup, cost, occupancy, commute, and what is included. Listing-specific terms still belong on each role."
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="profile-meals-description">
              Meals overview
            </label>
            <textarea
              className={styles.textarea}
              id="profile-meals-description"
              name="mealsDescription"
              rows={5}
              maxLength={2000}
              defaultValue={profile.mealsDescription ?? ""}
              placeholder="Describe the usual meal plan, shift coverage, cost, and dietary accommodations. Listing-specific terms still belong on each role."
            />
          </div>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.libraryHead}>
          <div>
            <p className={styles.fieldGroupHeading}>Frequently asked questions</p>
            <p className={styles.note}>
              Answer the practical questions seekers ask before applying. Only
              complete question-and-answer pairs are published.
            </p>
          </div>
          <span className={styles.libraryCount}>{faqs.length}/12</span>
        </div>
        {faqs.length > 0 ? (
          <div className={styles.libraryGrid}>
            {faqs.map((faq, index) => (
              <div key={faq.key} className={styles.librarySlot}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`profile-faq-question-${index}`}>
                    Question {index + 1}
                  </label>
                  <input
                    className={styles.input}
                    id={`profile-faq-question-${index}`}
                    type="text"
                    maxLength={240}
                    value={faq.question}
                    onChange={(event) => updateFaq(faq.key, "question", event.target.value)}
                    placeholder="How are days off scheduled?"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`profile-faq-answer-${index}`}>
                    Answer
                  </label>
                  <textarea
                    className={styles.textarea}
                    id={`profile-faq-answer-${index}`}
                    rows={5}
                    maxLength={1600}
                    value={faq.answer}
                    onChange={(event) => updateFaq(faq.key, "answer", event.target.value)}
                    placeholder="Schedules are posted ten days ahead…"
                  />
                </div>
                <button
                  type="button"
                  className={styles.removeLibraryPhoto}
                  onClick={() =>
                    setFaqs((current) => current.filter((item) => item.key !== faq.key))
                  }
                >
                  Remove question
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.note}>No FAQs added yet.</p>
        )}
        {faqs.length < 12 ? (
          <div className={styles.chips}>
            <button type="button" className={styles.chip} onClick={addFaq}>
              Add question
            </button>
          </div>
        ) : null}
      </div>

      {showBenefitLibrary ? (
        <div className={styles.fieldGroup}>
          <div className={styles.libraryHead}>
            <div>
              <p className={styles.fieldGroupHeading}>Reusable housing photos</p>
              <p className={styles.note}>
                Photo uploads replace and save that library slot immediately. Removing a default and
                all other profile edits take effect only after you choose Save changes.
              </p>
            </div>
            <div className={styles.libraryMeta}>
              <span className={styles.libraryCount}>Uploads auto-save</span>
              <span className={styles.libraryCount}>
                {HOUSING_PHOTO_ROLES.filter((role) => housingPhotos[role]).length}/4 complete
              </span>
            </div>
          </div>
          <div className={styles.libraryGrid}>
            {HOUSING_PHOTO_ROLES.map((role) => (
              <div key={role} className={styles.librarySlot}>
                <span className={styles.label}>{housingPhotoLabel(role, "farm")}</span>
                <ImageUpload
                  label={`Upload ${housingPhotoLabel(role, "farm").toLowerCase()}`}
                  currentUrl={housingPhotos[role]}
                  uploader={(file) => uploadHousingPhoto(role, file)}
                  onUpload={(url) =>
                    setHousingPhotos((current) => ({ ...current, [role]: url }))
                  }
                  disabled={isPending || uploadingCount > 0}
                  maxFileBytes={SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES}
                />
                {housingPhotos[role] ? (
                  <button
                    type="button"
                    className={styles.removeLibraryPhoto}
                    onClick={() =>
                      setHousingPhotos((current) => {
                        const next = { ...current };
                        delete next[role];
                        return next;
                      })
                    }
                    disabled={isPending || uploadingCount > 0}
                  >
                    Remove when saved
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <p className={styles.note}>
            Maritime listings relabel these same roles as cabin/berth, head, galley, and mess.
          </p>
        </div>
      ) : null}

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
                defaultValue={profile.twitter ?? ""}
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
          {profile.verified
            ? "Verified Host is automatic on any active paid plan — it isn't editable here."
            : "Verified Host is granted automatically once you're on an active paid plan."}
        </p>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.submit}
          type="submit"
          disabled={isPending || uploadingCount > 0}
        >
          <Icon name="action.forward" size={20} aria-hidden />
          <span>
            {isPending
              ? "Saving…"
              : uploadingCount > 0
                ? "Uploading photos…"
                : "Save changes"}
          </span>
        </button>
        {isPending || uploadingCount > 0 ? (
          <span className={`${styles.cancel} ${styles.cancelDisabled}`} aria-disabled="true">
            Discard unsaved changes
          </span>
        ) : (
          <Link className={styles.cancel} href="/host/profile">
            Discard unsaved changes
          </Link>
        )}
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
