import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";

import { SitePhoto } from "../../../../components/media/SitePhoto";
import styles from "./join-gate.module.css";

/**
 * The explicit "join as a seeker" choice (V2 D18).
 *
 * WHY A SCREEN AND NOT A SIDE EFFECT. Community is a seeker space. Someone
 * signed in without a seeker profile — most often a HOST following a Community
 * link out of their workspace — has not asked to become a seeker, and creating
 * the profile for them because they clicked a nav item would be a silent
 * conversion: a new row, a new identity in the product, a new set of things
 * their name appears on, from a navigation click. So the product stops and
 * asks, and the answer is a link the person presses, not an action this render
 * performs.
 *
 * NOTHING ON THIS PATH WRITES. The gate reads a profile row and renders. The
 * profile is created by the onboarding flow the primary action leads to, under
 * the seeker's own session, exactly as it is for anyone signing up as a seeker.
 */
export interface CommunityJoinGateProps {
  /** Whether the signed-in account already runs a host workspace. */
  readonly isHost: boolean;
  /** Where onboarding should return the new seeker. Already validated. */
  readonly returnTo: string;
}

export function CommunityJoinGate({ isHost, returnTo }: CommunityJoinGateProps) {
  const onboardingHref = `/onboarding?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className={styles.page} aria-labelledby="community-join-title">
      <div className={styles.frame}>
        <div className={styles.media}>
          {/* A LANDSCAPE, not a photograph of a person. This panel asks the
              visitor to adopt an identity ("join as a seeker"), and a figure
              beside that question reads as an example of one — which the
              photography honesty rule (lib/sitePhotos) forbids: nobody in the
              catalogue is a user of this product. */}
          <SitePhoto
            slug="idaho-01"
            size="card"
            className={styles.photo}
            sizes="(min-width: 900px) 26rem, 100vw"
          />
        </div>

        <div className={styles.body}>
          <p className={styles.eyebrow}>
            <Icon name="nav.feed" size={16} aria-hidden />
            Community
          </p>
          <h1 id="community-join-title" className={styles.title}>
            Community is a seeker space
          </h1>
          <p className={styles.lede}>
            {isHost
              ? "You're signed in with a host account. Community is where seekers compare seasons, housing and crews — you can join it as a seeker too, but that's a separate profile and it's your call."
              : "Photos, announcements and season notes are posted and read by seekers. Set up a free seeker profile to join in."}
          </p>

          <ul className={styles.points} role="list">
            <li className={styles.point}>
              <Icon name="system.success" size={16} aria-hidden />
              Free, always — seekers never pay on Explore &amp; Earn.
            </li>
            <li className={styles.point}>
              <Icon name="system.success" size={16} aria-hidden />
              Separate from any host workspace you already run.
            </li>
            <li className={styles.point}>
              <Icon name="system.success" size={16} aria-hidden />
              Nothing is created until you finish setting it up.
            </li>
          </ul>

          <div className={styles.actions}>
            <Link className={styles.primary} href={onboardingHref}>
              Join as a seeker
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
            <Link className={styles.ghost} href={isHost ? "/host" : "/"}>
              {isHost ? "Back to my host workspace" : "Not now"}
            </Link>
          </div>

          <p className={styles.footnote}>
            {isHost
              ? "Your host account, listings and applicants are untouched by this choice."
              : "You can browse every open role at /seek without a profile."}
          </p>
        </div>
      </div>
    </main>
  );
}
