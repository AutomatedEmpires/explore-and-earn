"use client";

import { useId, useMemo, useState } from "react";
import { Icon } from "@explore-and-earn/ui";

import { HostProfileHero } from "../host/HostProfileHero";
import { PublicListingCard } from "../host/PublicListingCard";
import {
  profileGaps,
  toPreviewHostProfile,
  toPreviewListing,
  type HostOnboardingDraft,
} from "./hostOnboardingDraft";
import styles from "./onboardingPreview.module.css";

/**
 * "This is how your company can appear to seekers" (spec V2-E §2).
 *
 * THE COMPONENTS ARE THE PRODUCTION ONES. HostProfileHero is what renders a
 * host's public /host/[id] page and PublicListingCard is what renders their
 * roles on it — both take plain typed props and no database handle, so the
 * in-progress draft feeds them directly. A host looking at this is looking at
 * the page, not at a rendering of what the page might be. That is the entire
 * reason the step exists; a redrawn preview could be flattering and wrong.
 *
 * "CAN APPEAR", NOT "WILL APPEAR", and the wording is load-bearing. The public
 * profile is reachable once a role is LIVE, and publishing is what a plan buys.
 * A preview that said "this is your profile" would be describing a page that
 * does not exist yet for an unactivated host.
 *
 * THE DEVICE TOGGLE IS A WIDTH CLAMP, not a second layout. The components are
 * responsive, so constraining the container reflows the SAME markup the way a
 * phone would. A separate mobile mock is a second thing to keep true, and it
 * would be the one that rots.
 *
 * NO ABSENCE MARKER OVER THE HOST'S OWN BLANKS. HostProfileHero omits every
 * section whose value is null, and the listing card is rendered only when
 * roleCardReady() says its triad can be filled from what the host actually
 * typed. Everything still missing is named in the guidance panel with what
 * filling it does — see hostOnboardingDraft.ts for why that is the rule.
 */

type Device = "desktop" | "mobile";

export interface HostSeekerPreviewProps {
  readonly draft: HostOnboardingDraft;
  /** The real host_profiles id once created; a placeholder before that. */
  readonly hostProfileId: string;
  readonly className?: string;
}

/**
 * REPORTS NOTHING ITSELF, deliberately. The wizard renders this in three
 * positions — the identity rail, the story rail and the preview step — so React
 * remounts it on every step change, and a once-per-mount guard in here would
 * reset each time and over-count a host who simply stepped back. The
 * seeker-preview funnel event is fired from the wizard's step transition, behind
 * the same session-scoped guard as every other step.
 */
export function HostSeekerPreview({
  draft,
  hostProfileId,
  className,
}: HostSeekerPreviewProps) {
  const [device, setDevice] = useState<Device>("desktop");
  const titleId = useId();

  const host = useMemo(
    () => toPreviewHostProfile(draft, hostProfileId),
    [draft, hostProfileId],
  );
  const listing = useMemo(() => toPreviewListing(draft), [draft]);
  const gaps = useMemo(() => profileGaps(draft), [draft]);

  return (
    <section
      className={`${styles.seekerPreview} ${className ?? ""}`}
      aria-labelledby={titleId}
    >
      <div className={styles.seekerHead}>
        <div className={styles.seekerHeadText}>
          <h2 id={titleId} className={styles.seekerTitle}>
            This is how your company can appear to seekers
          </h2>
          <p className={styles.seekerNote}>
            Rendered by the same components a seeker meets on your public
            profile, using what you have entered so far.
          </p>
        </div>

        <div
          className={styles.deviceToggle}
          role="group"
          aria-label="Preview width"
        >
          <button
            type="button"
            className={styles.deviceButton}
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
          >
            <Icon name="nav.map" size={16} aria-hidden />
            Desktop
          </button>
          <button
            type="button"
            className={styles.deviceButton}
            aria-pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
          >
            <Icon name="nav.profile" size={16} aria-hidden />
            Mobile
          </button>
        </div>
      </div>

      <div
        className={styles.viewport}
        role="region"
        aria-label={`Seeker view of your employer profile, ${device} width`}
      >
        {/* INERT, deliberately. These are the production components, so the
            hero's "See opportunities" jump and the listing card's crawlable
            /listing/<id> link are both real anchors — and neither resolves for a
            draft that has never been written. Marking the subtree inert removes
            the dead clicks and the stray tab stops without redrawing a
            look-alike card that could disagree with the one that ships. */}
        <div className={styles.viewportInner} data-device={device} inert>
          <HostProfileHero
            host={host}
            coverPhotoUrl={draft.roleCoverUrl}
            listingCount={listing ? 1 : 0}
          />

          {listing ? (
            <div className={styles.listingStrip}>
              <PublicListingCard
                listing={listing}
                hostName={host.companyName}
                hostVerified={false}
              />
            </div>
          ) : (
            <div className={styles.listingStrip}>
              <p className={styles.seekerNote}>
                Your first role will appear here as a card. It needs a title, a
                lane and at least one pay figure before it can be shown — a card
                is how seekers compare employers, and one with blanks in it is
                worse than none.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.gaps}>
        <h3 className={styles.gapsTitle}>What is still missing</h3>
        {gaps.length === 0 ? (
          <p className={styles.gapsComplete}>
            <Icon name="system.success" size={18} aria-hidden />
            Everything a seeker looks for is filled in.
          </p>
        ) : (
          <>
            <p className={styles.gapsLead}>
              Nothing below is required to carry on. Each one changes what a
              seeker can find out about you.
            </p>
            <ul className={styles.gapList}>
              {gaps.map((gap) => (
                <li key={gap.id} className={styles.gap}>
                  <span className={styles.gapIcon} aria-hidden>
                    <Icon name="system.info" size={18} />
                  </span>
                  <span className={styles.gapText}>
                    <span className={styles.gapLabel}>{gap.label}</span>
                    <span className={styles.gapBody}>{gap.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
