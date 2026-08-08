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
  /** Real listing-scoped weather, streamed by the live route when coordinates exist. */
  readonly weatherSlot?: ReactNode;
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

function hasWorkingHereDetails(host: PublicHostProfile): boolean {
  return Boolean(
    host.whyWorkForUs ||
      host.culture?.length ||
      host.managementApproach ||
      host.typicalDay ||
      host.workEnvironment,
  );
}

function hasLifeHereDetails(host: PublicHostProfile): boolean {
  return Boolean(
    host.remoteness ||
      host.transportation?.length ||
      host.nearbyServices?.length ||
      host.activities?.length,
  );
}

function ProfileNav({
  host,
  listingCount,
  hasWeather,
}: {
  readonly host: PublicHostProfile;
  readonly listingCount: number;
  readonly hasWeather: boolean;
}) {
  const items = [
    ...(host.about ? [{ href: "#about-heading", label: "Story" }] : []),
    {
      href: "#listings",
      label: listingCount === 1 ? "1 opportunity" : `${listingCount} opportunities`,
    },
    ...(hasWorkingHereDetails(host)
      ? [{ href: "#working-here-heading", label: "Working here" }]
      : []),
    ...(hasLifeHereDetails(host)
      ? [{ href: "#life-here-heading", label: "Living here" }]
      : []),
    ...(hasWeather ? [{ href: "#listing-weather", label: "Weather" }] : []),
    { href: "#reviews-heading", label: "Reviews" },
  ];

  return (
    <div className={styles.profileNavShell}>
      <nav className={styles.profileNav} aria-label="Host profile sections">
        {items.map((item) => (
          <a key={item.href} className={styles.profileNavLink} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
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
  if (!hasWorkingHereDetails(host)) return null;

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
  if (!hasLifeHereDetails(host)) return null;

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

function FieldGuide({
  host,
  listingCount,
  externalMapLinks,
}: {
  readonly host: PublicHostProfile;
  readonly listingCount: number;
  readonly externalMapLinks: boolean;
}) {
  const hostingSinceYear = host.createdAt
    ? new Date(host.createdAt).getFullYear()
    : null;

  return (
    <div className={styles.fieldGuide}>
      <div className={styles.fieldGuideHead}>
        <span className={styles.fieldGuideKicker}>At a glance</span>
        <h2 className={styles.fieldGuideTitle}>Your field guide</h2>
      </div>

      <dl className={styles.guideFacts}>
        <div className={styles.guideFact}>
          <dt><Icon name="status.open" size={18} aria-hidden />Open now</dt>
          <dd>{listingCount === 1 ? "1 opportunity" : `${listingCount} opportunities`}</dd>
        </div>
        {host.primaryLocationName ? (
          <div className={styles.guideFact}>
            <dt><Icon name="nav.map" size={18} aria-hidden />Based near</dt>
            <dd>{host.primaryLocationName}</dd>
          </div>
        ) : null}
        {hostingSinceYear ? (
          <div className={styles.guideFact}>
            <dt><Icon name="status.begins" size={18} aria-hidden />Member since</dt>
            <dd>{hostingSinceYear}</dd>
          </div>
        ) : null}
      </dl>

      {host.categoryScopes.length > 0 ? (
        <div className={styles.guideCategories} aria-label="Opportunity categories">
          {host.categoryScopes.map((scope) => (
            <span key={scope} className={styles.guideCategory}>
              <Icon
                name={CATEGORY_ICON[scope as keyof typeof CATEGORY_ICON] ?? "category.mix"}
                size={16}
                aria-hidden
              />
              {CATEGORY_LABEL[scope] ?? scope}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.promiseGuide} aria-label="Housing meals and pay overview">
        <div className={styles.promiseRow} data-kind="housing">
          <span className={styles.promiseIcon}><Icon name="benefit.housing" size={20} aria-hidden /></span>
          <div>
            <p className={styles.promiseLabel}>Housing</p>
            <p className={styles.promiseValue}>
              {host.housingOfferedGenerally ? "Offered" : "Not stated"}
            </p>
            {host.housingDescription ? (
              <p className={styles.promiseNote}>{host.housingDescription}</p>
            ) : null}
          </div>
        </div>
        <div className={styles.promiseRow} data-kind="meals">
          <span className={styles.promiseIcon}><Icon name="benefit.meals" size={20} aria-hidden /></span>
          <div>
            <p className={styles.promiseLabel}>Meals</p>
            <p className={styles.promiseValue}>
              {host.mealsOfferedGenerally ? "Offered" : "Not stated"}
            </p>
            {host.mealsDescription ? (
              <p className={styles.promiseNote}>{host.mealsDescription}</p>
            ) : null}
          </div>
        </div>
        <div className={styles.promiseRow} data-kind="pay">
          <span className={styles.promiseIcon}><Icon name="benefit.pay" size={20} aria-hidden /></span>
          <div>
            <p className={styles.promiseLabel}>Pay</p>
            <p className={styles.promiseValue}>See each opportunity</p>
          </div>
        </div>
      </div>

      <div className={styles.fieldGuideActions}>
        <a className={styles.guidePrimary} href="#listings">
          View opportunities <Icon name="action.forward" size={16} aria-hidden />
        </a>
        {host.primaryLocationName && externalMapLinks ? (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(host.primaryLocationName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.guideSecondary}
          >
            Open area in Maps <Icon name="action.forward" size={16} aria-hidden />
          </a>
        ) : null}
      </div>
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
  weatherSlot,
  reviewSlot,
  browseHref = "/seek",
  listingHrefPrefix = "/listing",
  externalMapLinks = true,
}: PublicHostProfileViewProps) {
  return (
    <div className={styles.page}>
      <HostProfileHero host={host} coverPhotoUrl={coverPhotoUrl} listingCount={listings.length} />
      <ProfileNav
        host={host}
        listingCount={listings.length}
        hasWeather={Boolean(weatherSlot)}
      />
      <HostTrustBand summary={ratingSummary} verified={host.verified} reviewsHref="#reviews-heading" />
      <div className={styles.contentGrid}>
        <aside className={styles.sidebar} aria-label="Host field guide">
          <FieldGuide
            host={host}
            listingCount={listings.length}
            externalMapLinks={externalMapLinks}
          />
        </aside>
        <div className={styles.mainCol}>
          {host.about ? (
            <NarrativeSection id="about-heading" title="About us">
              <div className={styles.aboutCard}><p className={styles.aboutText}>{host.about}</p></div>
            </NarrativeSection>
          ) : null}
          <ListingsSection
            listings={listings}
            host={host}
            browseHref={browseHref}
            listingHrefPrefix={listingHrefPrefix}
          />
          <WorkingHereSection host={host} />
          <SeasonSection host={host} />
          {host.team?.length ? <TeamSection team={host.team} /> : null}
          <LifeHereSection host={host} />
          {weatherSlot ? <div className={styles.weatherSection}>{weatherSlot}</div> : null}
          {host.faqs?.length ? <FaqSection faqs={host.faqs} /> : null}
          {reviewSlot}
          <HostReviews hostName={host.companyName} summary={ratingSummary} reviews={reviews} />
        </div>
      </div>
    </div>
  );
}
