"use client";

import { useState } from "react";
import Link from "next/link";
import { DiscoveryCard, Icon, type IconKey } from "@explore-and-earn/ui";
import type { OpportunityCategory } from "@explore-and-earn/contracts";

import {
  BenefitBucketDrawer,
  BenefitTrustModal,
  HostProfilePopup,
  PayDetailsDrawer,
  QuickPeekDrawer,
  ReportListingDrawer,
} from "../../discovery";
import { BoostListingPopup } from "../../host/BoostListingPopup";
import { SeekerResumePopup } from "../../host/SeekerResumePopup";
import { HousingFormDrawer } from "../../host/HousingFormDrawer";
import { MealsFormDrawer } from "../../host/MealsFormDrawer";
import { SeekerSearchDrawer } from "../../host/SeekerSearchDrawer";
import {
  SeekFilterPopup,
  type SeekFilterPopupValue,
} from "../../seeker/SeekFilterPopup";
import { SeekSortPopup } from "../../seeker/SeekSortPopup";
import { HeroPhotoPickerModal } from "../../seeker/HeroPhotoPickerModal";

import {
  DEMO_HOST,
  DEMO_HOST_LISTINGS,
  DEMO_LISTING,
  DEMO_RESUME,
  HOST_STATE_SPECIMENS,
  MATCH_SPECIMENS,
  SEEKER_STATE_SPECIMENS,
  SURFACE_SPECIMENS,
  type CardSpecimen,
} from "./specimens";
import styles from "./CatalogClient.module.css";

// ── Device presets ────────────────────────────────────────────────────────────

interface DevicePreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
}

const DEVICES: readonly DevicePreset[] = [
  { id: "mobile", label: "Mobile", width: 375 },
  { id: "mobile-l", label: "Mobile L", width: 430 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "desktop", label: "Desktop", width: 1280 },
  { id: "desktop-l", label: "Desktop L", width: 1440 },
];

// ── Popup registry ────────────────────────────────────────────────────────────

interface PopupTrigger {
  readonly key: string;
  readonly label: string;
  readonly icon: IconKey;
  readonly group: string;
}

const POPUP_TRIGGERS: readonly PopupTrigger[] = [
  // Listing detail popups
  { key: "quickpeek", label: "Quick peek", icon: "action.apply", group: "Listing detail" },
  { key: "pay", label: "Pay details", icon: "benefit.pay", group: "Listing detail" },
  { key: "bucket-housing", label: "Housing bucket", icon: "benefit.housing", group: "Listing detail" },
  { key: "bucket-meals", label: "Meals bucket", icon: "benefit.meals", group: "Listing detail" },
  { key: "trust-housing", label: "Housing trust (view)", icon: "trust.verified_host", group: "Listing detail" },
  { key: "trust-meals", label: "Meals trust (view)", icon: "trust.verified_host", group: "Listing detail" },
  { key: "host-profile", label: "Host profile", icon: "nav.profile", group: "Listing detail" },
  { key: "report-listing", label: "Report listing", icon: "action.report", group: "Listing detail" },
  // Seeker controls
  { key: "seek-filter", label: "Seek filter", icon: "action.filter", group: "Seeker controls" },
  { key: "seek-sort", label: "Seek sort", icon: "action.sort", group: "Seeker controls" },
  { key: "hero-photo", label: "Hero photo picker", icon: "nav.photos", group: "Seeker controls" },
  // Host controls
  { key: "boost", label: "Boost listing (tiers)", icon: "status.boosted", group: "Host controls" },
  { key: "housing-form", label: "Housing form (edit)", icon: "benefit.housing", group: "Host controls" },
  { key: "meals-form", label: "Meals form (edit)", icon: "benefit.meals", group: "Host controls" },
  { key: "invite-seeker", label: "Invite seeker (search)", icon: "action.forward", group: "Host controls" },
  { key: "seeker-resume", label: "Seeker resume", icon: "nav.profile", group: "Host controls" },
];

const POPUP_GROUPS = ["Listing detail", "Seeker controls", "Host controls"] as const;

/** Popups that have no standalone component to open in isolation (yet). */
const POPUP_UNAVAILABLE: readonly { label: string; note: string }[] = [
  {
    label: "Report host",
    note: "No standalone ReportHostDrawer exists — only ReportListingDrawer is implemented sitewide.",
  },
  {
    label: "Analytics quick-peek",
    note: "Analytics is a full dashboard (HostAnalyticsDashboard), not an isolatable popup.",
  },
];

// ── No-op card handlers (so every button/affordance renders) ──────────────────

const noop = () => {};
const CARD_HANDLERS = {
  onOpen: noop,
  onSave: noop,
  onApply: noop,
  onSkip: noop,
  onHostClick: noop,
  onLocationClick: noop,
  onHousingClick: noop,
  onMealsClick: noop,
  onPayClick: noop,
  onReport: noop,
  onSchedule: noop,
  onApprove: noop,
  onWarn: noop,
  onRemove: noop,
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogClient() {
  const [deviceId, setDeviceId] = useState<string>("mobile");
  const [activePopup, setActivePopup] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState<SeekFilterPopupValue>({
    housing: false,
    meals: false,
    visaSupport: false,
  });
  const [sortCategory, setSortCategory] = useState<OpportunityCategory | undefined>(
    undefined,
  );

  const device = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];
  const closePopup = () => setActivePopup(null);
  const show = (key: string) => activePopup === key;
  const gate = (key: string) => (show(key) ? DEMO_LISTING : null);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.head}>
        <p className={styles.kicker}>DEV CATALOG · not production · fixtures only</p>
        <h1 className={styles.title}>Card + Popup Catalog</h1>
        <p className={styles.lede}>
          Every DiscoveryCard variation and every sitewide popup, driven by local
          fixtures. Pick a screen size to see how cards compose at that width.
        </p>
        <Link href="/dev" className={styles.backLink}>
          <Icon name="action.back" size={16} aria-hidden />
          Back to Mock Bench
        </Link>
      </header>

      {/* ── Screen-size selector ── */}
      <div className={styles.sizeBar} role="group" aria-label="Screen size">
        <span className={styles.sizeBarLabel}>Screen size</span>
        <div className={styles.sizeButtons}>
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={d.id === deviceId ? styles.sizeActive : styles.size}
              onClick={() => setDeviceId(d.id)}
              aria-pressed={d.id === deviceId}
            >
              {d.label}
              <span className={styles.sizePx}>{d.width}px</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Device frame (the real width constraint) ── */}
      <div className={styles.stage}>
        <div
          className={styles.frame}
          style={{ width: `${device.width}px` }}
          data-device={device.id}
        >
          <div className={styles.frameBar} aria-hidden>
            <span className={styles.frameDot} />
            <span className={styles.frameDot} />
            <span className={styles.frameDot} />
            <span className={styles.frameWidth}>
              {device.label} · {device.width}px
            </span>
          </div>

          <div className={styles.frameBody}>
            <CardSection
              title="Discovery card · Surfaces"
              hint="One listing rendered across every card surface."
              specimens={SURFACE_SPECIMENS}
            />
            <CardSection
              title="Discovery card · Seeker application states"
              hint="How the seeker's card reads through the application lifecycle."
              specimens={SEEKER_STATE_SPECIMENS}
            />
            <CardSection
              title="Discovery card · Match & boost"
              hint="Match-quality pill bands and the boosted placement stamp."
              specimens={MATCH_SPECIMENS}
            />
            <CardSection
              title="Discovery card · Host listing states"
              hint="How a host's own listing card reads while managing it."
              specimens={HOST_STATE_SPECIMENS}
            />

            {/* ── Popups ── */}
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Popups</h2>
                <p className={styles.sectionHint}>
                  Triggers sit in the frame, but each popup portals to the page and
                  opens at the real browser viewport — resize the window (or use
                  responsive dev-tools) to preview a popup at a device width.
                </p>
              </div>

              {POPUP_GROUPS.map((group) => (
                <div key={group} className={styles.popupGroup}>
                  <h3 className={styles.popupGroupTitle}>{group}</h3>
                  <div className={styles.popupButtons}>
                    {POPUP_TRIGGERS.filter((p) => p.group === group).map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        className={styles.popupBtn}
                        onClick={() => setActivePopup(p.key)}
                      >
                        <Icon name={p.icon} size={16} aria-hidden />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className={styles.popupGroup}>
                <h3 className={styles.popupGroupTitle}>Not isolatable</h3>
                <ul className={styles.unavailableList}>
                  {POPUP_UNAVAILABLE.map((u) => (
                    <li key={u.label} className={styles.unavailableItem}>
                      <span className={styles.unavailableName}>{u.label}</span>
                      <span className={styles.unavailableNote}>{u.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ── Popup instances (portal to body) ── */}
      <QuickPeekDrawer listing={gate("quickpeek")} onClose={closePopup} />
      <PayDetailsDrawer listing={gate("pay")} onClose={closePopup} />
      <BenefitBucketDrawer
        listing={gate("bucket-housing")}
        bucket="housing"
        onClose={closePopup}
      />
      <BenefitBucketDrawer
        listing={gate("bucket-meals")}
        bucket="meals"
        onClose={closePopup}
      />
      <BenefitTrustModal
        listing={gate("trust-housing")}
        bucket="housing"
        onClose={closePopup}
      />
      <BenefitTrustModal
        listing={gate("trust-meals")}
        bucket="meals"
        onClose={closePopup}
      />
      <HostProfilePopup
        host={show("host-profile") ? DEMO_HOST : null}
        listings={DEMO_HOST_LISTINGS}
        onClose={closePopup}
      />
      <ReportListingDrawer listing={gate("report-listing")} onClose={closePopup} />

      <SeekFilterPopup
        open={show("seek-filter")}
        onClose={closePopup}
        value={filterValue}
        onApply={(v) => {
          setFilterValue(v);
          closePopup();
        }}
      />
      <SeekSortPopup
        open={show("seek-sort")}
        onClose={closePopup}
        category={sortCategory}
        onApply={(c) => {
          setSortCategory(c ?? undefined);
          closePopup();
        }}
      />
      <HeroPhotoPickerModal
        open={show("hero-photo")}
        onClose={closePopup}
        onSelect={noop}
        currentUrl={null}
        seekerProfileId={null}
        category="seasonal"
      />

      <BoostListingPopup
        open={show("boost")}
        onClose={closePopup}
        listingId={DEMO_LISTING.id}
        listingTitle={DEMO_LISTING.title}
        isLive
      />
      <HousingFormDrawer
        open={show("housing-form")}
        onClose={closePopup}
        listingId={DEMO_LISTING.id}
      />
      <MealsFormDrawer
        open={show("meals-form")}
        onClose={closePopup}
        listingId={DEMO_LISTING.id}
      />
      <SeekerSearchDrawer
        isOpen={show("invite-seeker")}
        onClose={closePopup}
        listingId={DEMO_LISTING.id}
        listingTitle={DEMO_LISTING.title}
      />
      <SeekerResumePopup
        open={show("seeker-resume")}
        onClose={closePopup}
        applicantName="Avery Nguyen"
        resume={DEMO_RESUME}
      />
    </div>
  );
}

// ── Card section ──────────────────────────────────────────────────────────────

function CardSection({
  title,
  hint,
  specimens,
}: {
  readonly title: string;
  readonly hint: string;
  readonly specimens: readonly CardSpecimen[];
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionHint}>{hint}</p>
      </div>
      <div className={styles.deck}>
        {specimens.map((spec) => (
          <figure key={spec.key} className={styles.specimen}>
            <DiscoveryCard
              data={spec.data}
              surface={spec.surface}
              cardState={spec.cardState}
              {...CARD_HANDLERS}
            />
            <figcaption className={styles.caption}>{spec.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
