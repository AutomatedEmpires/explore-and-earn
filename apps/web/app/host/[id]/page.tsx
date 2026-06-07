import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { getPublicHostProfile, getPublicListingsByHost } from "@explore-and-earn/db";
import { VerifiedHostBadge, Icon } from "@explore-and-earn/ui";
import { PublicListingCard } from "../../../components/host/PublicListingCard";

export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const host = await getPublicHostProfile(id);

  if (!host) return { title: "Host not found" };

  const title = `${host.companyName} · Explore & Earn`;
  const description = host.about
    ? host.about.slice(0, 155)
    : `View open opportunities from ${host.companyName} on Explore & Earn.`;

  const canonical = `${baseUrl}/host/${id}`;
  const ogImage = host.photoUrl ?? `${baseUrl}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "profile",
      images: [{ url: ogImage, width: 1200, height: 630, alt: host.companyName }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PublicHostProfilePage({ params }: Props) {
  const { id } = await params;
  const [host, listings] = await Promise.all([
    getPublicHostProfile(id),
    getPublicListingsByHost(id),
  ]);

  if (!host) notFound();

  const hostingSinceYear = host.createdAt
    ? new Date(host.createdAt).getFullYear()
    : null;

  const aboutIsLong = (host.about?.length ?? 0) > 200;

  return (
    <main
      style={{
        backgroundColor: "var(--color-paper)",
        minHeight: "100vh",
        padding: "var(--space-gutter)",
      }}
    >
      <div style={{ maxWidth: "56rem", margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ marginBottom: "var(--space-section)" }}>
          {/* Photo + company */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-16)",
              marginBottom: "var(--space-16)",
            }}
          >
            {host.photoUrl ? (
              <div
                style={{
                  position: "relative",
                  width: "80px",
                  height: "80px",
                  borderRadius: "var(--radius-image)",
                  border: "3px solid var(--border-ink)",
                  backgroundColor: "var(--color-surface)",
                  overflow: "hidden",
                  padding: "4px",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    borderRadius: "calc(var(--radius-image) - 4px)",
                    overflow: "hidden",
                  }}
                >
                  <Image
                    src={host.photoUrl}
                    alt={host.companyName}
                    fill
                    style={{ objectFit: "cover" }}
                  />
                </div>
              </div>
            ) : (
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "var(--radius-image)",
                  border: "3px solid var(--border-ink)",
                  backgroundColor: "var(--color-surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="nav.profile" size={24} aria-hidden />
              </div>
            )}

            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--type-page-size)",
                  lineHeight: "var(--type-page-lh)",
                  color: "var(--text-primary)",
                  margin: 0,
                  marginBottom: "var(--space-4)",
                }}
              >
                {host.companyName}
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-8)",
                  flexWrap: "wrap",
                }}
              >
                {host.primaryLocationName && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-4)",
                      fontSize: "var(--type-meta-size)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <Icon name="nav.map" size={16} aria-hidden />
                    <span>{host.primaryLocationName}</span>
                  </div>
                )}
                {host.attestationStatus === "attested" && <VerifiedHostBadge />}
                {hostingSinceYear && (
                  <span
                    style={{
                      fontSize: "var(--type-meta-size)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Hosting since {hostingSinceYear}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* About */}
          {host.about && (
            <div style={{ marginTop: "var(--space-16)" }}>
              {aboutIsLong ? (
                <details>
                  <summary
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: "var(--type-body-size)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      listStyle: "none",
                    }}
                  >
                    <span>{host.about.slice(0, 200)}…</span>
                    <span
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: "var(--font-weight-medium)",
                        marginLeft: "var(--space-4)",
                      }}
                    >
                      Read more
                    </span>
                  </summary>
                  <p
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: "var(--type-body-size)",
                      color: "var(--text-secondary)",
                      marginTop: "var(--space-12)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {host.about}
                  </p>
                </details>
              ) : (
                <p
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--type-body-size)",
                    color: "var(--text-secondary)",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {host.about}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Listings */}
        <section>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--type-section-size)",
              lineHeight: "var(--type-section-lh)",
              color: "var(--text-primary)",
              marginBottom: "var(--space-16)",
            }}
          >
            Open opportunities
          </h2>

          {listings.length === 0 ? (
            <div
              style={{
                padding: "var(--space-32)",
                textAlign: "center",
                backgroundColor: "var(--color-surface-raised)",
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border-soft)",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--type-body-size)",
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                No open opportunities right now. Check back soon.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "var(--space-16)",
              }}
            >
              {listings.map((listing) => (
                <PublicListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
