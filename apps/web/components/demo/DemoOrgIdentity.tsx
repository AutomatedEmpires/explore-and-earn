import { Icon } from "@explore-and-earn/ui";

import { DEMO_ORG } from "./enterpriseDemo";
import { DemoBrandMark } from "./DemoBrandMark";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The demo employer's identity block.
 *
 * The cover is a LANE GRADIENT and the logo is the in-repo brand mark (spec
 * D9) — no stock photography, no invented brand. The gradient frame is also the
 * photography SLOT: when the founder supplies an asset pack, a real cover drops
 * into this element with no layout change.
 */
export function DemoOrgIdentity({ id }: { readonly id?: string }) {
  return (
    <div id={id}>
      <div className={styles.orgCover}>
        <div className={styles.orgCoverArt} aria-hidden="true" />
        <div className={styles.orgCoverScrim} aria-hidden="true" />
        <div className={styles.orgCoverInner}>
          <span className={styles.orgLogo}>
            <DemoBrandMark size={26} />
          </span>
          <div>
            <h2 className={styles.orgName}>{DEMO_ORG.name}</h2>
            <div className={styles.orgMeta}>
              <span>{DEMO_ORG.location}</span>
              <span className={styles.orgBadge}>
                <Icon name="trust.verified_host" size={14} aria-hidden />
                Verified host
              </span>
              <span className={styles.orgBadge}>{DEMO_ORG.planName} plan</span>
            </div>
          </div>
        </div>
      </div>
      <p className={`${styles.panelNote} ${styles.spacedNote}`}>{DEMO_ORG.tagline}</p>
      <DemoLabel text={DEMO_ORG.demoLabel} />
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
      <div className={styles.photoSlot}>
        <span className={styles.photoSlotLabel}>
          Photo slot — your own photography sits here
        </span>
      </div>
    </div>
  );
}
