import { Icon } from "@explore-and-earn/ui";

import { SitePhoto } from "../media/SitePhoto";
import { DEMO_LIVE_ROLES, DEMO_ORG } from "./enterpriseDemo";
import { DemoBrandMark } from "./DemoBrandMark";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The demo employer's identity band.
 *
 * The cover is a REAL PHOTOGRAPH from the site-photo catalog (spec D16
 * supersedes D9's gradient-first rule). Alt text comes from the catalog and
 * describes the scene; nothing here captions a photographed person as staff of
 * this product, and the org "logo" remains the in-repo brand mark rather than
 * an invented one.
 */
export function DemoOrgIdentity({ id }: { readonly id?: string }) {
  const openings = DEMO_LIVE_ROLES.reduce(
    (total, role) => total + role.openPositions,
    0,
  );

  return (
    <div className={styles.identityBand} id={id}>
      <div className={styles.identityPhoto}>
        <SitePhoto
          slug={DEMO_ORG.coverPhotoSlug}
          size="hero"
          priority
          sizes="(min-width: 1120px) 1120px, 100vw"
        />
        <div className={styles.identityScrim} aria-hidden="true" />
      </div>

      <div className={styles.identityBody}>
        <div className={styles.identityTop}>
          <span className={styles.identityMark}>
            <DemoBrandMark size={26} />
          </span>
          <h2 className={styles.identityName}>{DEMO_ORG.name}</h2>
          <span className={styles.orgBadge}>
            <Icon name="trust.verified_host" size={14} aria-hidden />
            Verified host
          </span>
          <span className={styles.orgBadge}>{DEMO_ORG.planName} plan</span>
          <DemoLabel text={DEMO_ORG.demoLabel} />
        </div>

        <div className={styles.seasonStrip}>
          <span className={styles.seasonChip}>
            <Icon name="nav.map" size={14} aria-hidden />
            {DEMO_ORG.location}
          </span>
          <span className={styles.seasonChip}>
            <Icon name="status.seasonal" size={14} aria-hidden />
            {DEMO_ORG.seasonLabel}
          </span>
          <span className={styles.seasonChip}>
            <Icon name="status.open" size={14} aria-hidden />
            {openings} positions open across {DEMO_LIVE_ROLES.length} live roles
          </span>
        </div>

        <p className={styles.lede}>{DEMO_ORG.tagline}</p>
      </div>
    </div>
  );
}

/** The structured facts a seeker filters on — stated, never implied. */
export function DemoOrgFacts({ id }: { readonly id?: string }) {
  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle}>What the season looks like</h3>
        <DemoLabel text={DEMO_ORG.demoLabel} />
      </div>
      <p className={styles.panelNote}>{DEMO_ORG.about}</p>
      <ul className={styles.factGrid}>
        {DEMO_ORG.facts.map((fact) => (
          <li key={fact.label} className={styles.fact}>
            <span className={styles.factLabel}>{fact.label}</span>
            <span className={styles.factValue}>{fact.value}</span>
          </li>
        ))}
      </ul>
      <div className={styles.detailHero}>
        <SitePhoto
          slug={DEMO_ORG.seasonPhotoSlug}
          size="hero"
          sizes="(min-width: 1120px) 1080px, 100vw"
        />
      </div>
    </div>
  );
}

