"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@explore-and-earn/ui";
import type { Timeline } from "../../lib/readiness";
import { HeroPhotoPickerModal } from "./HeroPhotoPickerModal";
import { ReadinessSlider } from "./ReadinessSlider";
import styles from "./SeekerHero.module.css";

export interface SeekerHeroProps {
  readonly seekerName: string;
  readonly initials: string;
  readonly bio: string | null;
  readonly avatarUrl: string | null;
  readonly heroCoverUrl: string | null;
  readonly seekingTimeline: Timeline | null;
  readonly preferredCategories: readonly string[];
  readonly seekerProfileId: string | null;
  readonly onReadinessChange: (value: Timeline) => void;
  readonly onHeroCoverChange: (url: string | null) => void;
  readonly readinessSaving?: boolean;
}

// Category atmospheres are tokenized in styles/tokens.css — every "maritime"
// surface renders the same blue. Never inline category hex here again.
const CATEGORY_GRADIENTS: Record<string, string> = {
  maritime: "var(--gradient-category-maritime)",
  farm:     "var(--gradient-category-farm)",
  remote:   "var(--gradient-category-remote)",
  seasonal: "var(--gradient-category-seasonal)",
  mix:      "var(--gradient-category-mix)",
};

const DEFAULT_GRADIENT = "var(--gradient-category-default)";

const CATEGORY_LABELS: Record<string, string> = {
  maritime: "Maritime",
  farm:     "Farm",
  remote:   "Remote",
  seasonal: "Seasonal",
  mix:      "Mix",
};

function resolveBackground(heroCoverUrl: string | null, categories: readonly string[]): string {
  if (heroCoverUrl) return heroCoverUrl;
  const first = categories[0];
  return (first && CATEGORY_GRADIENTS[first]) ?? DEFAULT_GRADIENT;
}

function isPhotoUrl(url: string): boolean {
  return url.startsWith("http") || url.startsWith("/");
}

export function SeekerHero({
  seekerName,
  initials,
  bio,
  avatarUrl,
  heroCoverUrl,
  seekingTimeline,
  preferredCategories,
  seekerProfileId,
  onReadinessChange,
  onHeroCoverChange,
  readinessSaving,
}: SeekerHeroProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const bg = resolveBackground(heroCoverUrl, preferredCategories);
  const isPhoto = heroCoverUrl ? isPhotoUrl(heroCoverUrl) : false;

  const heroStyle: React.CSSProperties = isPhoto ? {} : { background: bg };

  return (
    <>
      <section className={styles.hero} style={heroStyle} aria-label="Your seeker profile">
        {/* Background photo */}
        {isPhoto && heroCoverUrl && (
          <Image
            src={heroCoverUrl}
            alt=""
            fill
            sizes="100vw"
            className={styles.heroBg}
            priority
          />
        )}

        {/* Gradient overlay + vignette */}
        <div className={styles.heroOverlay} aria-hidden="true" />

        {/* Top bar */}
        <div className={styles.topBar}>
          {seekerProfileId && (
            <button
              type="button"
              className={styles.editBtn}
              onClick={() => setPickerOpen(true)}
              aria-label="Change background photo"
            >
              <Icon name="action.more" size={16} />
              <span>Background</span>
            </button>
          )}
        </div>

        {/* Identity block */}
        <div className={styles.identity}>
          {/* Avatar */}
          <div className={styles.avatarWrap}>
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={seekerName}
                width={84}
                height={84}
                className={styles.avatarImg}
              />
            ) : (
              <div className={styles.avatarInitials} aria-hidden="true">
                {initials}
              </div>
            )}
          </div>

          {/* Name + badge + bio */}
          <div className={styles.identityText}>
            {/* Name row: name and seeker badge inline */}
            <div className={styles.nameRow}>
              <h1 className={styles.seekerName}>{seekerName}</h1>
              <div className={styles.seekerBadge} aria-label="Seeker profile">
                <span className={styles.seekerBadgeDot} aria-hidden="true" />
                Seeker
              </div>
            </div>

            {preferredCategories.length > 0 && (
              <div className={styles.categoryPills} aria-label="Preferred work categories">
                {preferredCategories.slice(0, 3).map((cat) => (
                  <span
                    key={cat}
                    className={`${styles.categoryPill} ${styles[`cat_${cat}` as keyof typeof styles] ?? ""}`}
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                ))}
              </div>
            )}

            {bio ? (
              <p className={styles.bio}>{bio}</p>
            ) : seekerProfileId ? (
              <Link href="/profile" className={styles.bioAdd}>
                + Add a bio
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <ReadinessSlider
        value={seekingTimeline}
        onChange={onReadinessChange}
        saving={readinessSaving}
      />

      <HeroPhotoPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onHeroCoverChange}
        currentUrl={heroCoverUrl}
        seekerProfileId={seekerProfileId}
        category={preferredCategories[0] ?? ""}
      />
    </>
  );
}
