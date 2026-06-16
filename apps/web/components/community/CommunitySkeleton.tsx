import styles from "../seeker/CommunityDashboard.module.css";

/**
 * Route-level loading skeleton for the community area.
 * Server component — renders a paper-textured masthead placeholder plus a
 * shimmer feed/photo grid while `force-dynamic` data resolves.
 * Presentational only; reuses the community design-system classes.
 */

function PostSkeleton() {
  return (
    <div className={styles.skeletonCard} aria-hidden>
      <div className={styles.skeletonHead}>
        <div className={styles.skeletonAvatar} />
        <div className={styles.skeletonLines}>
          <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineTiny}`} />
        </div>
      </div>
      <div className={styles.skeletonText} />
      <div className={`${styles.skeletonText} ${styles.skeletonTextShort}`} />
      <div className={styles.skeletonImage} />
    </div>
  );
}

export function CommunitySkeleton({ variant = "feed" }: { readonly variant?: "feed" | "photos" }) {
  return (
    <div className={styles.dashboard} aria-busy="true" aria-label="Loading community">
      <div className={styles.welcomeBar}>
        <div className={styles.mastheadTop}>
          <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} style={{ background: "rgba(255,255,255,0.18)" }} />
          <div className={styles.skeletonText} style={{ maxWidth: "16rem", height: 28, background: "rgba(255,255,255,0.22)" }} />
          <div className={styles.skeletonText} style={{ maxWidth: "30rem", background: "rgba(255,255,255,0.14)" }} />
        </div>
      </div>
      <div className={styles.layout}>
        <div className={styles.mainCol}>
          {variant === "photos" ? (
            <div className={styles.photoMasonry} aria-hidden>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className={styles.skeletonPolaroid}>
                  <div className={styles.skeletonImage} />
                  <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
                </div>
              ))}
            </div>
          ) : (
            <>
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
