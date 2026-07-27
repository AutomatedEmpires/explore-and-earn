import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { getSeekerProfileForHost } from "@explore-and-earn/db";
import { Icon, Meter, Chip, type IconKey } from "@explore-and-earn/ui";
import { MARKETPLACE_CATEGORIES } from "@explore-and-earn/contracts";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Seeker profile",
  robots: "noindex",
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function computeCompletenessScore(profile: {
  shortBio?: string | null;
  desiredCategories: readonly string[];
  desiredRoles: readonly string[];
  housingPreference?: string | null;
  locationPref?: string | null;
}): number {
  let score = 0;
  if (profile.shortBio) score += 20;
  if (profile.desiredCategories.length > 0) score += 20;
  if (profile.desiredRoles.length > 0) score += 20;
  if (profile.housingPreference) score += 20;
  if (profile.locationPref) score += 20;
  return score;
}

export default async function SeekerPublicProfilePage({ params }: Props) {
  const { id: seekerProfileId } = await params;
  const { userId, getToken } = await auth();

  if (!userId) notFound();

  const token = await getToken();
  if (!token) notFound();

  const profile = await getSeekerProfileForHost(token, seekerProfileId);

  if (!profile || profile.visibilityStatus === "hidden") notFound();

  const displayName = profile.displayName ?? "Seeker";
  const completenessScore = computeCompletenessScore(profile);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>

        {/* Header: avatar + name + bio */}
        <header className={styles.header}>
          <div className={styles.identity}>
            <div className={styles.avatar} aria-hidden>
              <Icon name="nav.profile" size={24} aria-hidden />
            </div>
            <div className={styles.nameGroup}>
              <h1 className={styles.name}>{displayName}</h1>
              {profile.locationPref && (
                <span className={styles.locationPref}>
                  {profile.locationPref.replace("_", " ")}
                </span>
              )}
            </div>
          </div>

          {profile.shortBio && (
            <p className={styles.bio}>{profile.shortBio}</p>
          )}
        </header>

        {/* Desired work */}
        {(profile.desiredCategories.length > 0 || profile.desiredRoles.length > 0) && (
          <section className={styles.section} aria-labelledby="desired-work-heading">
            <h2 id="desired-work-heading" className={styles.sectionTitle}>
              Desired work
            </h2>
            <div className={styles.chips}>
              {profile.desiredCategories.map((cat) => {
                const iconKey = (MARKETPLACE_CATEGORIES as readonly string[]).includes(cat)
                  ? `category.${cat}`
                  : "nav.seek";
                return (
                  <Chip key={cat} icon={iconKey as IconKey}>
                    {cat}
                  </Chip>
                );
              })}
              {profile.desiredRoles.map((role) => (
                <Chip key={role}>{role}</Chip>
              ))}
            </div>
          </section>
        )}

        {/* Expectations */}
        {profile.housingPreference && (
          <section className={styles.section} aria-labelledby="expectations-heading">
            <h2 id="expectations-heading" className={styles.sectionTitle}>
              Expectations
            </h2>
            <div className={styles.expectations}>
              <p className={styles.expectationRow}>
                <strong className={styles.expectationLabel}>Housing:</strong>{" "}
                {profile.housingPreference.replace("_", " ")}
              </p>
            </div>
          </section>
        )}

        {/* Profile completeness */}
        <section className={styles.section} aria-labelledby="completeness-heading">
          <h2 id="completeness-heading" className={styles.sectionTitle}>
            Profile completeness
          </h2>
          <Meter value={completenessScore} label="Profile completeness" />
        </section>

        {/* Actions */}
        <div className={styles.actions}>
          <Link
            className={styles.actionPrimary}
            href={`/host/invites?seekerProfileId=${seekerProfileId}`}
          >
            <Icon name="action.forward" size={16} aria-hidden />
            Invite this seeker
          </Link>
          <Link className={styles.actionSecondary} href="/host/messages">
            Message
          </Link>
        </div>

      </div>
    </main>
  );
}
