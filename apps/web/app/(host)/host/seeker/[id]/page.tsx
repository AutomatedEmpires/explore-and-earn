import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { getSeekerProfileForHost } from "@explore-and-earn/db";
import { Icon, Meter, Chip, Button } from "@explore-and-earn/ui";
import { MARKETPLACE_CATEGORIES } from "@explore-and-earn/contracts";

export const metadata: Metadata = {
  title: "Seeker profile",
  robots: "noindex",
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SeekerPublicProfilePage({ params }: Props) {
  const { id: seekerProfileId } = await params;
  const { userId } = await auth();

  if (!userId) notFound();

  const { getToken } = await auth();
  const token = await getToken({ template: "supabase" });
  if (!token) notFound();

  const profile = await getSeekerProfileForHost(token, userId, seekerProfileId);

  if (!profile || profile.visibilityStatus === "hidden") notFound();

  const displayName = profile.displayName ?? "Seeker";
  const completenessScore = profile.onboardingComplete ? 85 : 40;

  return (
    <main
      style=
        backgroundColor: "var(--color-paper)",
        minHeight: "100vh",
        padding: "var(--space-gutter)",
      
    >
      <div style= maxWidth: "42rem", margin: "0 auto" >
        {/* Header */}
        <div style= marginBottom: "var(--space-section)" >
          {/* Avatar placeholder (Icon nav.profile) */}
          <div
            style=
              display: "flex",
              alignItems: "center",
              gap: "var(--space-16)",
              marginBottom: "var(--space-16)",
            
          >
            <div
              style=
                width: "64px",
                height: "64px",
                borderRadius: "var(--radius-pill)",
                border: "2px solid var(--border-ink)",
                backgroundColor: "var(--color-surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              
            >
              <Icon name="nav.profile" size={24} aria-hidden />
            </div>

            <div style= flex: 1 >
              <h1
                style=
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--type-page-size)",
                  lineHeight: "var(--type-page-lh)",
                  color: "var(--text-primary)",
                  margin: 0,
                  marginBottom: "var(--space-4)",
                
              >
                {displayName}
              </h1>
              {profile.locationPref && (
                <div
                  style=
                    fontSize: "var(--type-meta-size)",
                    color: "var(--text-secondary)",
                    textTransform: "capitalize",
                  
                >
                  {profile.locationPref.replace("_", " ")}
                </div>
              )}
            </div>
          </div>

          {/* Short bio */}
          {profile.shortBio && (
            <p
              style=
                fontFamily: "var(--font-ui)",
                fontSize: "var(--type-body-size)",
                lineHeight: "var(--type-body-lh)",
                color: "var(--text-secondary)",
                marginBottom: "var(--space-16)",
                whiteSpace: "pre-wrap",
              
            >
              {profile.shortBio}
            </p>
          )}
        </div>

        {/* Desired work */}
        {(profile.desiredCategories.length > 0 ||
          profile.desiredRoles.length > 0) && (
          <section style= marginBottom: "var(--space-section)" >
            <h2
              style=
                fontFamily: "var(--font-display)",
                fontSize: "var(--type-section-size)",
                lineHeight: "var(--type-section-lh)",
                color: "var(--text-primary)",
                marginBottom: "var(--space-12)",
              
            >
              Desired work
            </h2>

            <div style= display: "flex", flexWrap: "wrap", gap: "var(--space-8)" >
              {profile.desiredCategories.map((cat) => {
                const iconKey =
                  (MARKETPLACE_CATEGORIES as readonly string[]).includes(cat)
                    ? `category.${cat}`
                    : "nav.seek";
                return (
                  <Chip key={cat} icon={iconKey as any}>
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
        <section style= marginBottom: "var(--space-section)" >
          <h2
            style=
              fontFamily: "var(--font-display)",
              fontSize: "var(--type-section-size)",
              lineHeight: "var(--type-section-lh)",
              color: "var(--text-primary)",
              marginBottom: "var(--space-12)",
            
          >
            Expectations
          </h2>

          <div style= display: "flex", flexDirection: "column", gap: "var(--space-8)" >
            {profile.housingPreference && (
              <div
                style=
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--type-body-size)",
                  color: "var(--text-secondary)",
                
              >
                <strong style= color: "var(--text-primary)" >Housing:</strong>{" "}
                {profile.housingPreference.replace("_", " ")}
              </div>
            )}
          </div>
        </section>

        {/* Completeness */}
        <section style= marginBottom: "var(--space-section)" >
          <Meter value={completenessScore} label="Profile completeness" />
        </section>

        {/* Actions */}
        <div style= display: "flex", gap: "var(--space-12)" >
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = `/host/invites?seekerProfileId=${seekerProfileId}`;
            }}
          >
            Invite this seeker
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              window.location.href = "/host/messages";
            }}
          >
            Message
          </Button>
        </div>
      </div>
    </main>
  );
}
