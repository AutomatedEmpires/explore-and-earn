import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type {
  HostRatingSummary,
  HostProfileFaq,
  HostReview,
  HostTeamMember,
  PublicHostListing,
  PublicHostProfile,
} from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";

import { byMonetization } from "../../lib/ranking";
import { HostProfileHero } from "./HostProfileHero";
import { HostReviews } from "./HostReviews";
import { HostTrustBand } from "./HostTrustBand";
import { PublicListingCard } from "./PublicListingCard";
import styles from "../../app/[locale]/host/[id]/page.module.css";

export interface PublicHostProfileViewProps {
  readonly host: PublicHostProfile;
  readonly listings: readonly PublicHostListing[];
  readonly ratingSummary: HostRatingSummary;
  readonly reviews: readonly HostReview[];
  readonly coverPhotoUrl?: string | null;
  /** A live route may pass its eligibility-gated review composer here. */
  readonly reviewSlot?: ReactNode;
  /** Demo surfaces override these destinations to keep sample IDs isolated. */
  readonly browseHref?: string;
  readonly listingHrefPrefix?: string;
  readonly externalMapLinks?: boolean;
}

const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Multi-category",
};

const CATEGORY_ICON = {
  farm: "category.farm",
  maritime: "category.maritime",
  remote: "category.remote",
  seasonal: "category.seasonal",
  mix: "category.mix",
} as const;

function QuickFacts({
  listingCount,
  housingOffered,
  mealsOffered,
  categoryScopes,
  hostingSinceYear,
}: {
  readonly listingCount: number;
  readonly housingOffered: boolean;
  readonly mealsOffered: boolean;
  readonly categoryScopes: readonly string[];
  readonly hostingSinceYear: number | null;
}) {
  return (
    <div className={styles.factsStrip}>
      <div className={styles.facts}>
        <div className={`${styles.fact} ${styles.factBlue}`}>
          <Icon name="status.open" size={16} aria-hidden />
          <div className={styles.factBody}>
            <span className={styles.factValue}>{listingCount}</span>
            <span className={styles.factLabel}>{listingCount === 1 ? "Listing" : "Listings"}</span>
          </div>
        </div>
        {housingOffered ? (
          <div className={`${styles.fact} ${styles.factGreen}`}>
            <Icon name="category.seasonal" size={16} aria-hidden />
            <div className={styles.factBody}>
              <span className={styles.factValue}>Housing</span>
              <span className={styles.factLabel}>Available</span>
            </div>
          </div>
        ) : null}
        {mealsOffered ? (
          <div className={`${styles.fact} ${styles.factOrange}`}>
            <Icon name="category.farm" size={16} aria-hidden />
            <div className={styles.factBody}>
              <span className={styles.factValue}>Meals</span>
              <span className={styles.factLabel}>Available</span>
            </div>
          </div>
        ) : null}
        {categoryScopes.map((scope) => (
          <div key={scope} className={`${styles.fact} ${styles.factCategory}`}>
            <Icon
              name={CATEGORY_ICON[scope as keyof typeof CATEGORY_ICON] ?? "category.mix"}
              size={16}
              aria-hidden
            />
            <div className={styles.factBody}>
              <span className={styles.factValue}>{CATEGORY_LABEL[scope] ?? scope}</span>
              <span className={styles.factLabel}>Category</span>
            </div>
          </div>
        ))}
        {hostingSinceYear ? (
          <div className={`${styles.fact} ${styles.factMuted}`}>
            <Icon name="status.begins" size={16} aria-hidden />
            <div className={styles.factBody}>
              <span className={styles.factValue}>{hostingSinceYear}</span>
              <span className={styles.factLabel}>Member since</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NarrativeSection({ id, title, children }: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionHeading}>{title}</h2>
      {children}
    </section>
  );
}

function TeamSection({ team }: { readonly team: readonly HostTeamMember[] }) {
  return (
    <NarrativeSection id="team-heading" title="Meet the team">
      <div className={styles.teamGrid}>
        {team.map((member, index) => (
          <div key={`${member.name}-${index}`} className={styles.teamCard}>
            <div className={styles.teamPhotoFrame}>
              {member.photoUrl ? (
                <Image src={member.photoUrl} alt={member.name} fill sizes="96px" className={styles.teamPhoto} />
              ) : (
                <div className={styles.teamPhotoPlaceholder}>
                  <Icon name="nav.profile" size={24} aria-hidden />
                </div>
              )}
            </div>
            {member.name ? <p className={styles.teamName}>{member.name}</p> : null}
            {member.role ? <p className={styles.teamRole}>{member.role}</p> : null}
          </div>
        ))}
      </div>
    </NarrativeSection>
  );
}

function HighlightList({ values, perks = false }: {
  readonly values: readonly string[];
  readonly perks?: boolean;
}) {
  return (
    <ul className={perks ? styles.perkList : styles.chipList}>
      {values.map((value, index) => (
        <li key={`${value}-${index}`} className={perks ? styles.perkRow : styles.chip}>
          {perks ? (
            <span className={styles.perkIcon} aria-hidden>
              <Icon name="status.accepted" size={16} aria-hidden />
            </span>
          ) : (
            <Icon name="status.match" size={16} aria-hidden />
          )}
          <span className={perks ? styles.perkText : undefined}>{value}</span>
        </li>
      ))}
    </ul>
  );
}

function WorkingHereSection({ host }: { readonly host: PublicHostProfile }) {
  const hasDetails = Boolean(
    host.whyWorkForUs ||
      host.culture?.length ||
      host.managementApproach ||
      host.typicalDay ||
      host.workEnvironment,
  );
  if (!hasDetails) return null;

  return (
    <NarrativeSection id="working-here-heading" title="Working here">
      {host.whyWorkForUs ? (
        <div className={styles.whyCard}>
          <div className={styles.whyAccent} aria-hidden>
            <Icon name="status.match" size={20} aria-hidden />
          </div>
          <p className={styles.whyText}>{host.whyWorkForUs}</p>
        </div>
      ) : null}
      {host.culture?.length ? (
        <div className={styles.benefitCard}>
          <h3 className={styles.benefitCardTitle}>What we value</h3>
          <HighlightList values={host.culture} />
        </div>
      ) : null}
      {host.managementApproach || host.typicalDay || host.workEnvironment ? (
        <div className={styles.benefitCard}>
          {host.managementApproach ? (
            <div className={styles.benefitRow}>
              <div className={styles.benefitRowIcon} data-kind="housing">
                <Icon name="nav.profile" size={20} aria-hidden />
              </div>
              <div>
                <h3 className={styles.mapTitle}>How we manage</h3>
                <p className={styles.aboutText}>{host.managementApproach}</p>
              </div>
            </div>
          ) : null}
          {host.typicalDay ? (
            <div className={styles.benefitRow}>
              <div className={styles.benefitRowIcon} data-kind="meals">
                <Icon name="status.begins" size={20} aria-hidden />
              </div>
              <div>
                <h3 className={styles.mapTitle}>A typical day</h3>
                <p className={styles.aboutText}>{host.typicalDay}</p>
              </div>
            </div>
          ) : null}
          {host.workEnvironment ? (
            <div className={styles.benefitRow}>
              <div className={styles.benefitRowIcon} data-kind="housing">
                <Icon name="category.mix" size={20} aria-hidden />
              </div>
              <div>
                <h3 className={styles.mapTitle}>Work environment</h3>
                <p className={styles.aboutText}>{host.workEnvironment}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </NarrativeSection>
  );
}

function SeasonSection({ host }: { readonly host: PublicHostProfile }) {
  if (!host.seasonRhythm?.length && !host.training?.length && !host.perks?.length) {
    return null;
  }
  return (
    <NarrativeSection id="season-heading" title="The season">
      <div className={styles.benefitCard}>
        {host.seasonRhythm?.length ? (
          <>
            <h3 className={styles.benefitCardTitle}>How the season unfolds</h3>
            <HighlightList values={host.seasonRhythm} perks />
          </>
        ) : null}
        {host.training?.length ? (
          <>
            <h3 className={styles.benefitCardTitle}>Training &amp; growth</h3>
            <HighlightList values={host.training} perks />
          </>
        ) : null}
        {host.perks?.length ? (
          <>
            <h3 className={styles.benefitCardTitle}>Perks &amp; benefits</h3>
            <HighlightList values={host.perks} perks />
          </>
        ) : null}
      </div>
    </NarrativeSection>
  );
}

function LifeHereSection({ host }: { readonly host: PublicHostProfile }) {
  const hasDetails = Boolean(
    host.remoteness ||
      host.transportation?.length ||
      host.nearbyServices?.length ||
      host.activities?.length,
  );
  if (!hasDetails) return null;

  return (
    <NarrativeSection id="life-here-heading" title="Living here">
      {host.remoteness ? (
        <div className={styles.aboutCard}>
          <h3 className={styles.mapTitle}>Remoteness &amp; access</h3>
          <p className={styles.aboutText}>{host.remoteness}</p>
        </div>
      ) : null}
      {host.transportation?.length ? (
        <div className={styles.benefitCard}>
          <h3 className={styles.benefitCardTitle}>Getting around</h3>
          <HighlightList values={host.transportation} perks />
        </div>
      ) : null}
      {host.nearbyServices?.length ? (
        <div className={styles.benefitCard}>
          <h3 className={styles.benefitCardTitle}>Nearby essentials</h3>
          <HighlightList values={host.nearbyServices} />
        </div>
      ) : null}
      {host.activities?.length ? (
        <div className={styles.benefitCard}>
          <h3 className={styles.benefitCardTitle}>Life outside work</h3>
          <HighlightList values={host.activities} />
        </div>
      ) : null}
    </NarrativeSection>
  );
}

function FaqSection({ faqs }: { readonly faqs: readonly HostProfileFaq[] }) {
  return (
    <NarrativeSection id="faq-heading" title="Questions, answered">
      <div className={styles.benefitCard}>
        {faqs.map((faq, index) => (
          <details key={`${faq.question}-${index}`} className={styles.aboutCard}>
            <summary className={styles.benefitCardTitle}>{faq.question}</summary>
            <p className={styles.aboutText}>{faq.answer}</p>
          </details>
        ))}
      </div>
    </NarrativeSection>
  );
}

function ListingsSection({
  listings,
  host,
  browseHref,
  listingHrefPrefix,
}: {
  readonly listings: readonly PublicHostListing[];
  readonly host: PublicHostProfile;
  readonly browseHref: string;
  readonly listingHrefPrefix: string;
}) {
  const ordered = [...listings].sort(byMonetization(() => ({})));
  return (
    <section id="listings" className={styles.section} aria-labelledby="listings-heading">
      <div className={styles.sectionHead}>
        <h2 id="listings-heading" className={styles.sectionHeading}>Open opportunities</h2>
        <Link className={styles.browseCta} href={browseHref}>
          Browse all <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      </div>
      {ordered.length > 0 ? (
        <div className={styles.listingsGrid}>
          {ordered.map((listing, index) => (
            <PublicListingCard
              key={listing.id}
              listing={listing}
              hostName={host.companyName}
              hostVerified={host.verified}
              hostAvatarUrl={host.photoUrl}
              priority={index < 2}
              href={`${listingHrefPrefix}/${listing.id}`}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyListings}>
          <div className={styles.emptyIcon}><Icon name="category.mix" size={24} aria-hidden /></div>
          <p className={styles.emptyTitle}>No open opportunities right now</p>
          <p className={styles.emptyNote}>Check back soon or explore other hosts.</p>
          <Link className={styles.browseCta} href={browseHref}>
            Explore all listings <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}

function LocationMapCard({ location, externalMapLinks }: {
  readonly location: string;
  readonly externalMapLinks: boolean;
}) {
  return (
    <div className={styles.mapCard}>
      <div className={styles.mapSurface} aria-hidden>
        <div className={styles.mapContours} />
        <div className={styles.mapPin}><Icon name="nav.map" size={20} aria-hidden /></div>
      </div>
      <div className={styles.mapBody}>
        <h3 className={styles.mapTitle}>Location</h3>
        <p className={styles.mapLocation}><Icon name="nav.map" size={16} aria-hidden />{location}</p>
        {externalMapLinks ? (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapLink}
          >
            Open in Maps <Icon name="action.forward" size={16} aria-hidden />
          </a>
        ) : (
          <p className={styles.emptyNote}>Map links are disabled in this sample workspace.</p>
        )}
      </div>
    </div>
  );
}

function HousingMealsCard({ host }: { readonly host: PublicHostProfile }) {
  if (
    !host.housingOfferedGenerally &&
    !host.mealsOfferedGenerally &&
    !host.housingDescription &&
    !host.mealsDescription
  ) {
    return null;
  }
  return (
    <div className={styles.benefitCard}>
      <h3 className={styles.benefitCardTitle}>Housing &amp; meals</h3>
      {host.housingOfferedGenerally || host.housingDescription ? (
        <div className={styles.benefitRow}>
          <div className={styles.benefitRowIcon} data-kind="housing"><Icon name="category.seasonal" size={20} aria-hidden /></div>
          <div>
            <p className={styles.benefitRowLabel}>Housing</p>
            <p className={styles.benefitRowNote}>
              {host.housingDescription ??
                "This host generally provides housing. Confirm the exact arrangement on each listing."}
            </p>
          </div>
        </div>
      ) : null}
      {host.mealsOfferedGenerally || host.mealsDescription ? (
        <div className={styles.benefitRow}>
          <div className={styles.benefitRowIcon} data-kind="meals"><Icon name="category.farm" size={20} aria-hidden /></div>
          <div>
            <p className={styles.benefitRowLabel}>Meals</p>
            <p className={styles.benefitRowNote}>
              {host.mealsDescription ??
                "This host generally provides meals. Confirm the exact arrangement on each listing."}
            </p>
          </div>
        </div>
      ) : null}
      <Link className={styles.benefitCardLink} href="#listings">
        View listings for details <Icon name="action.forward" size={16} aria-hidden />
      </Link>
    </div>
  );
}

/**
 * Canonical public employer destination. Both the live `/host/:id` route and
 * isolated walkthrough routes render this exact view; only their data loaders,
 * write-capable review slot, and destinations differ.
 */
export function PublicHostProfileView({
  host,
  listings,
  ratingSummary,
  reviews,
  coverPhotoUrl = listings.find((listing) => listing.coverPhotoUrl)?.coverPhotoUrl ?? null,
  reviewSlot,
  browseHref = "/seek",
  listingHrefPrefix = "/listing",
  externalMapLinks = true,
}: PublicHostProfileViewProps) {
  const hostingSinceYear = host.createdAt ? new Date(host.createdAt).getFullYear() : null;
  const hasSidebar = Boolean(
    host.primaryLocationName ||
      host.housingOfferedGenerally ||
      host.mealsOfferedGenerally ||
      host.housingDescription ||
      host.mealsDescription,
  );

  return (
    <div className={styles.page}>
      <HostProfileHero host={host} coverPhotoUrl={coverPhotoUrl} listingCount={listings.length} />
      <QuickFacts
        listingCount={listings.length}
        housingOffered={host.housingOfferedGenerally}
        mealsOffered={host.mealsOfferedGenerally}
        categoryScopes={host.categoryScopes}
        hostingSinceYear={hostingSinceYear}
      />
      <HostTrustBand summary={ratingSummary} verified={host.verified} reviewsHref="#reviews-heading" />
      <div className={hasSidebar ? styles.contentGrid : styles.contentSingle}>
        <div className={styles.mainCol}>
          {host.about ? (
            <NarrativeSection id="about-heading" title="About us">
              <div className={styles.aboutCard}><p className={styles.aboutText}>{host.about}</p></div>
            </NarrativeSection>
          ) : null}
          <WorkingHereSection host={host} />
          <SeasonSection host={host} />
          {host.team?.length ? <TeamSection team={host.team} /> : null}
          <LifeHereSection host={host} />
          <ListingsSection
            listings={listings}
            host={host}
            browseHref={browseHref}
            listingHrefPrefix={listingHrefPrefix}
          />
          {host.faqs?.length ? <FaqSection faqs={host.faqs} /> : null}
          {reviewSlot}
          <HostReviews hostName={host.companyName} summary={ratingSummary} reviews={reviews} />
        </div>
        {hasSidebar ? (
          <aside className={styles.sidebar}>
            {host.primaryLocationName ? (
              <LocationMapCard location={host.primaryLocationName} externalMapLinks={externalMapLinks} />
            ) : null}
            <HousingMealsCard host={host} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
