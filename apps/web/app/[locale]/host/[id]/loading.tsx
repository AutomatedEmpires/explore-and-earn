import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

const NAV_KEYS = ["story", "roles", "work", "living", "reviews"];
const FACT_KEYS = ["open", "location", "category"];
const CARD_KEYS = ["opportunity-one", "opportunity-two"];

/** Content-shaped public employer profile fallback. */
export default function HostProfileLoading() {
  return (
    <div className={styles.page} role="status" aria-busy="true">
      <div className={styles.cover}><Skeleton variant="rect" /></div>
      <div className={styles.identity}>
        <div className={styles.avatar}><Skeleton variant="rect" /></div>
        <div className={styles.identityText}>
          <div className={styles.eyebrow}><Skeleton variant="text" /></div>
          <div className={styles.name}><Skeleton variant="text" /></div>
          <div className={styles.tagline}><Skeleton variant="text" /></div>
        </div>
        <div className={styles.action}><Skeleton variant="rect" /></div>
      </div>

      <div className={styles.nav}>
        {NAV_KEYS.map((key) => (
          <div key={key} className={styles.navItem}><Skeleton variant="text" /></div>
        ))}
      </div>

      <div className={styles.content}>
        <div className={styles.guide}>
          <div className={styles.guideTitle}><Skeleton variant="text" /></div>
          {FACT_KEYS.map((key) => (
            <div key={key} className={styles.fact}><Skeleton variant="text" /></div>
          ))}
          <div className={styles.guideAction}><Skeleton variant="rect" /></div>
        </div>
        <div className={styles.main}>
          <section className={styles.story}>
            <div className={styles.heading}><Skeleton variant="text" /></div>
            <div className={styles.copy}><Skeleton variant="text" /></div>
            <div className={styles.copyShort}><Skeleton variant="text" /></div>
          </section>
          <section>
            <div className={styles.heading}><Skeleton variant="text" /></div>
            <div className={styles.cards}>
              {CARD_KEYS.map((key) => (
                <div key={key} className={styles.card}>
                  <div className={styles.cardImage}><Skeleton variant="rect" /></div>
                  <div className={styles.cardLine}><Skeleton variant="text" /></div>
                  <div className={styles.cardMeta}><Skeleton variant="text" /></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <span className={styles.srOnly}>Loading host profile</span>
    </div>
  );
}
