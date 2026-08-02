import styles from "./loading.module.css";

/**
 * Detail-shaped loading face. The only boundary above this route is the
 * [locale] discovery-grid skeleton — six listing cards — which lied about the
 * page shape on every navigation and forced a full-viewport reflow when the
 * immersive detail resolved. This skeleton promises what actually arrives:
 * a hero band, a facts row, and reading sections.
 */
export default function ListingDetailLoading() {
  return (
    <div className={styles.wrap} role="status" aria-busy="true">
      <span className={styles.srOnly}>Loading opportunity</span>
      <div className={styles.hero} aria-hidden />
      <div className={styles.body} aria-hidden>
        <div className={styles.glanceRow}>
          <div className={styles.glanceCell} />
          <div className={styles.glanceCell} />
          <div className={styles.glanceCell} />
          <div className={styles.glanceCell} />
        </div>
        <div className={styles.section} />
        <div className={styles.section} />
        <div className={styles.sectionShort} />
      </div>
    </div>
  );
}
