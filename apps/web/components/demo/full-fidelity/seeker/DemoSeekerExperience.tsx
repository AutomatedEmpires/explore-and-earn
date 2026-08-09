"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  DiscoveryCard,
  type DiscoveryCardData,
} from "@explore-and-earn/ui";
import type {
  HostRatingSummary,
  PublicHostListing,
  PublicHostProfile,
} from "@explore-and-earn/db";

import { PublicHostProfileView } from "../../../host/PublicHostProfileView";
import { DEFAULT_CURRENCY } from "../../../../lib/format";

import {
  applicationById,
  formatDemoDate,
  listingById,
  seasonLength,
  seekerDemoApplications,
  seekerDemoAnnouncements,
  seekerDemoHost,
  seekerDemoInterviews,
  seekerDemoListings,
  seekerDemoNotifications,
  seekerDemoNow,
  seekerDemoPerson,
  seekerDemoThreads,
  seekerDemoWeatherDays,
  seekerDemoWeatherDisclosure,
  threadById,
  type SeekerDemoApplication,
  type SeekerDemoInterview,
  type SeekerDemoListing,
  type SeekerDemoPhotoCategories,
} from "./model";
import {
  profileReadiness,
  useDemoSeekerSession,
  type DemoLocalApplication,
} from "./DemoSeekerSession";
import {
  SEEKER_DEMO_ROOT as DEMO_ROOT,
  applicationHrefForListing,
  applicationStatus,
  profileEditHrefForApplication,
} from "./presentation";
import styles from "./SeekerDemo.module.css";

export type SeekerDemoSurface =
  | "home"
  | "seek"
  | "swipe"
  | "map"
  | "listing"
  | "apply"
  | "host"
  | "profile"
  | "profileEdit"
  | "saved"
  | "applications"
  | "application"
  | "messages"
  | "thread"
  | "notifications"
  | "schedule"
  | "assistant"
  | "resume"
  | "invites"
  | "offers"
  | "accepted"
  | "notSelected"
  | "withdrawn"
  | "community"
  | "journey"
  | "badges"
  | "settings"
  | "help";

type BenefitKind = "housing" | "meals" | "pay";
type PhotoCategory = keyof SeekerDemoPhotoCategories;

function routeParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function SurfaceHeader({ eyebrow, title, lede, action }: {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly action?: ReactNode;
}) {
  return (
    <header className={styles.surfaceHeader}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.lede}>{lede}</p>
      </div>
      {action ? <div className={styles.headerAction}>{action}</div> : null}
    </header>
  );
}

function StatusChip({ children, tone = "neutral" }: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "positive" | "attention";
}) {
  return <span className={`${styles.statusChip} ${styles[`status_${tone}`]}`}>{children}</span>;
}

function ListingPhoto({ listing, index = 0, category, className = "" }: {
  readonly listing: SeekerDemoListing;
  readonly index?: number;
  readonly category?: PhotoCategory;
  readonly className?: string;
}) {
  const photo = category
    ? listing.photoCategories[category]
    : listing.photos[index % Math.max(1, listing.photos.length)];
  const subject = category ? `${category} scene` : "sample scene";
  return (
    <div
      className={`${styles.listingPhoto} ${className}`}
      role="img"
      aria-label={`${subject[0]?.toUpperCase()}${subject.slice(1)} for ${listing.title}`}
      style={photo ? { backgroundImage: `linear-gradient(180deg, transparent 45%, color-mix(in srgb, var(--color-ink) 62%, transparent)), url("${photo}")` } : undefined}
    />
  );
}

function BenefitDialog({ listing, kind, onClose }: {
  readonly listing: SeekerDemoListing;
  readonly kind: BenefitKind;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const priorFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeRef.current?.focus();

    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      window.removeEventListener("keydown", handleDialogKeys);
      priorFocus?.focus();
    };
  }, [onClose]);

  const copy: {
    readonly title: string;
    readonly value: string;
    readonly body: string;
    readonly photo: PhotoCategory;
    readonly facts: readonly { readonly label: string; readonly value: string }[];
    readonly sections: readonly { readonly title: string; readonly items: readonly string[] }[];
  } = {
    housing: {
      title: "Housing",
      value: listing.housing,
      body: "The host supplied these housing terms for the sample role. The four category-accurate photos below are illustrative examples, not host-supplied evidence of the property.",
      photo: "housing" as const,
      facts: [
        { label: "Home type", value: listing.housingDetails.type },
        { label: "Cost", value: listing.housingDetails.costCents === 0 ? `Included · $0/${listing.housingDetails.costUnit}` : `$${(listing.housingDetails.costCents / 100).toFixed(2)}/${listing.housingDetails.costUnit}` },
        { label: "Occupancy", value: listing.housingDetails.occupancy },
        { label: "From work", value: listing.housingDetails.distanceFromWork },
        { label: "Availability", value: listing.housingDetails.availability },
      ],
      sections: [
        { title: "Amenities", items: listing.housingDetails.amenities },
        { title: "Utilities", items: listing.housingDetails.utilities },
        { title: "House rules", items: listing.housingDetails.rules },
      ],
    },
    meals: {
      title: "Meals",
      value: listing.meals,
      body: "These are the sample role’s stated meal terms. The four category-accurate photos below are illustrative examples, not host-supplied evidence of the meal setup; dietary accommodations still need direct confirmation with the host.",
      photo: "meals" as const,
      facts: [
        { label: "Meal style", value: listing.mealsDetails.style },
        { label: "Cost", value: listing.mealsDetails.costCents === 0 ? `Included · $0/${listing.mealsDetails.costUnit}` : `$${(listing.mealsDetails.costCents / 100).toFixed(2)}/${listing.mealsDetails.costUnit}` },
      ],
      sections: [
        { title: "Included", items: listing.mealsDetails.included },
        { title: "Dietary accommodations", items: listing.mealsDetails.dietaryAccommodations },
      ],
    },
    pay: {
      title: "Pay",
      value: listing.pay,
      body: "This walkthrough shows the host’s stated rate only. Taxes, overtime, tips, and deductions belong in the written offer and are not estimated here.",
      photo: "workplace" as const,
      facts: [
        { label: "Rate", value: listing.payDetails.summary },
        { label: "Estimated hours", value: `${listing.payDetails.estimatedHoursPerWeek} per week` },
      ],
      sections: [
        { title: "Additional compensation", items: listing.payDetails.additionalCompensation },
      ],
    },
  }[kind];
  const benefitPhotos = kind === "pay" ? null : listing.benefitPhotos[kind];
  const galleryDisclosure = kind === "housing"
    ? "Illustrative category examples only — these scenes are not host-supplied evidence of this property."
    : "Illustrative category examples only — these scenes are not host-supplied evidence of this meal setup.";

  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="benefit-dialog-title"
        aria-describedby="benefit-dialog-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className={styles.dialogClose} aria-label="Close details" onClick={onClose}>×</button>
        {kind === "pay" ? <ListingPhoto listing={listing} category={copy.photo} className={styles.dialogPhoto} /> : null}
        <p className={styles.eyebrow}>Role detail · sample account</p>
        <h2 id="benefit-dialog-title">{copy.title}</h2>
        <p className={styles.dialogValue}>{copy.value}</p>
        <p id="benefit-dialog-description">{copy.body}</p>
        {benefitPhotos ? (
          <section className={styles.benefitPhotoSection} aria-labelledby="benefit-photo-heading">
            <div className={styles.benefitPhotoIntro}>
              <h3 id="benefit-photo-heading">Photo categories</h3>
              <p className={styles.benefitPhotoDisclosure}>{galleryDisclosure}</p>
            </div>
            <ul
              className={styles.benefitPhotoGrid}
              aria-label={`${copy.title} illustrative photo categories`}
            >
              {benefitPhotos.map((photo) => (
                <li key={photo.id}>
                  <figure className={styles.benefitPhotoFigure}>
                    <div className={styles.benefitPhotoFrame}>
                      <Image
                        className={styles.benefitPhotoImage}
                        src={photo.imageUrl}
                        alt={photo.imageAlt}
                        width={photo.imageWidth}
                        height={photo.imageHeight}
                        sizes="(max-width: 540px) 42vw, 220px"
                      />
                    </div>
                    <figcaption className={styles.benefitPhotoCaption}>
                      <strong>{photo.label}</strong>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <dl className={styles.dialogFacts}>
          {copy.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
        </dl>
        {copy.sections.map((section) => section.items.length > 0 ? (
          <div key={section.title} className={styles.dialogList}>
            <h3>{section.title}</h3>
            <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null)}
        <Link className={styles.textLink} href={`${DEMO_ROOT}/listing/${listing.id}`} onClick={onClose}>
          Review the complete listing →
        </Link>
      </section>
    </div>
  );
}

function ActionBar({ listing, onAfterAction }: {
  readonly listing: SeekerDemoListing;
  readonly onAfterAction?: (message: string, action: "skip" | "save" | "apply") => void;
}) {
  const { appliedIds, savedIds, skippedIds, save, skip } = useDemoSeekerSession();
  const router = useRouter();
  const applied = appliedIds.includes(listing.id);
  const saved = savedIds.includes(listing.id);
  const skipped = skippedIds.includes(listing.id);

  return (
    <div className={styles.actionBar} aria-label={`Actions for ${listing.title}`}>
      <button
        type="button"
        className={`${styles.actionButton} ${styles.actionSkip}`}
        aria-pressed={skipped}
        onClick={() => {
          skip(listing.id);
          onAfterAction?.(`${listing.title} moved out of this demo discovery queue.`, "skip");
        }}
      >
        {skipped ? "Skipped" : "Skip"}
      </button>
      <button
        type="button"
        className={`${styles.actionButton} ${styles.actionApply}`}
        disabled={applied}
        onClick={() => {
          onAfterAction?.(`Review your sample profile before confirming ${listing.title}.`, "apply");
          router.push(`${DEMO_ROOT}/listing/${listing.id}/apply`);
        }}
      >
        {applied ? "Submitted in demo" : "Apply"}
      </button>
      <button
        type="button"
        className={`${styles.actionButton} ${styles.actionSave}`}
        aria-pressed={saved}
        onClick={() => {
          save(listing.id);
          onAfterAction?.(saved ? `${listing.title} removed from saved.` : `${listing.title} saved in this demo.`, "save");
        }}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}

function DiscoveryListingCard({ listing, onAfterAction }: {
  readonly listing: SeekerDemoListing;
  readonly onAfterAction?: (message: string, action: "skip" | "save" | "apply") => void;
}) {
  const router = useRouter();
  const [benefit, setBenefit] = useState<BenefitKind | null>(null);
  const { appliedIds, savedIds, skippedIds } = useDemoSeekerSession();
  const data: DiscoveryCardData = {
    id: listing.id,
    hostName: seekerDemoHost.name,
    title: listing.title,
    category: listing.category,
    location: listing.location,
    opportunityWindow: `${formatDemoDate(listing.startDate, { month: "short", day: "numeric" })} – ${formatDemoDate(listing.endDate, { month: "short", day: "numeric" })}`,
    begins: formatDemoDate(listing.startDate, { month: "short", day: "numeric", year: "numeric" }),
    ends: formatDemoDate(listing.endDate, { month: "short", day: "numeric", year: "numeric" }),
    closesOn: formatDemoDate(listing.deadline, { month: "short", day: "numeric" }),
    seasonLength: seasonLength(listing),
    coverImageUrl: listing.photos[0],
    verifiedHost: seekerDemoHost.verified,
    matchScore: listing.matchScore,
    triad: {
      housing: listing.housing,
      meals: listing.meals,
      pay: listing.pay,
    },
    benefitProvision: {
      housing: listing.housingProvision,
      meals: listing.mealsProvision,
      pay: listing.payProvision,
    },
    housingSummary: listing.housing,
    mealsSummary: listing.meals,
  };
  const cardState = appliedIds.includes(listing.id)
    ? "applied" as const
    : savedIds.includes(listing.id)
      ? "saved" as const
      : skippedIds.includes(listing.id)
        ? "skipped" as const
        : "matched" as const;

  return (
    <div className={styles.discoveryCardWrap}>
      <DiscoveryCard
        data={data}
        surface="discovery_feed"
        cardState={cardState}
        imageLoading="lazy"
        onOpen={() => router.push(`${DEMO_ROOT}/listing/${listing.id}`)}
        onHostClick={() => router.push(`${DEMO_ROOT}/host/${seekerDemoHost.id}`)}
        onLocationClick={() => router.push(`${DEMO_ROOT}/map`)}
        onHousingClick={() => setBenefit("housing")}
        onMealsClick={() => setBenefit("meals")}
        onPayClick={() => setBenefit("pay")}
        actions={<ActionBar listing={listing} onAfterAction={onAfterAction} />}
        previouslySkipped={skippedIds.includes(listing.id)}
      />
      {benefit ? <BenefitDialog listing={listing} kind={benefit} onClose={() => setBenefit(null)} /> : null}
    </div>
  );
}

function InlineNotice({ message }: { readonly message: string }) {
  return <p className={styles.inlineNotice} role="status" aria-live="polite">{message}</p>;
}

function HomeSurface() {
  const { appliedIds, profile, savedIds, skippedIds } = useDemoSeekerSession();
  const interview = seekerDemoInterviews[0];
  const interviewApplication = interview
    ? seekerDemoApplications.find((application) => application.id === interview.applicationId)
    : undefined;
  const interviewListing = listingById(interviewApplication?.listingId);
  const nextListing = seekerDemoListings.find((listing) => (
    !appliedIds.includes(listing.id) && !skippedIds.includes(listing.id)
  ));

  return (
    <div className={styles.surface}>
      <SurfaceHeader
        eyebrow={`Sample account · ${formatDemoDate(seekerDemoNow.toISOString(), { weekday: "long", month: "long", day: "numeric" })}`}
        title={`Your season, ${seekerDemoPerson.name.split(" ")[0]}.`}
        lede="A populated account that keeps discovery, applications, conversations, and the next interview connected. Every action remains in this tab."
        action={<Link className={styles.primaryLink} href={`${DEMO_ROOT}/seek`}>Explore matches</Link>}
      />

      <section className={styles.statGrid} aria-label="Seeker account summary">
        <Link href={`${DEMO_ROOT}/profile`} className={styles.statCard}>
          <span>Profile ready</span><strong>{profileReadiness(profile)}%</strong><small>Review your seeker profile</small>
        </Link>
        <Link href={`${DEMO_ROOT}/saved`} className={styles.statCard}>
          <span>Saved</span><strong>{savedIds.length}</strong><small>Compare your shortlist</small>
        </Link>
        <Link href={`${DEMO_ROOT}/applications`} className={styles.statCard}>
          <span>Applications</span><strong>{appliedIds.length}</strong><small>See progress and next steps</small>
        </Link>
        <Link href={`${DEMO_ROOT}/messages`} className={styles.statCard}>
          <span>Conversations</span><strong>{seekerDemoThreads.length}</strong><small>Continue with host teams</small>
        </Link>
      </section>

      {interview && interviewListing ? (
        <section className={styles.attentionCard}>
          <div>
            <p className={styles.eyebrow}>Next on your calendar</p>
            <h2>{interviewListing.title} interview</h2>
            <p>{formatDemoDate(interview.startsAt, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} · {interview.durationMinutes} minutes · {interview.format}</p>
          </div>
          <Link className={styles.secondaryLink} href={`${DEMO_ROOT}/schedule`}>View schedule</Link>
        </section>
      ) : null}

      <section>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Continue exploring</p><h2>A strong next match</h2></div>
          <div className={styles.modeLinks} aria-label="Discovery modes">
            <Link href={`${DEMO_ROOT}/seek`}>Seek</Link>
            <Link href={`${DEMO_ROOT}/swipe`}>Swipe</Link>
            <Link href={`${DEMO_ROOT}/map`}>Map</Link>
          </div>
        </div>
        {nextListing ? <div className={styles.singleCard}><DiscoveryListingCard listing={nextListing} /></div> : null}
      </section>
    </div>
  );
}

function SeekSurface({ initialQuery = "" }: { readonly initialQuery?: string }) {
  const { appliedIds, skippedIds } = useDemoSeekerSession();
  const [query, setQuery] = useState(initialQuery);
  const [benefitFilter, setBenefitFilter] = useState("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);
  const listings = seekerDemoListings.filter((listing) => {
    if (skippedIds.includes(listing.id) || appliedIds.includes(listing.id)) return false;
    const matchesQuery = `${listing.title} ${listing.location} ${seekerDemoHost.name}`.toLowerCase().includes(query.toLowerCase());
    const matchesBenefit = benefitFilter === "all"
      || (benefitFilter === "housing" && !/not (provided|included|stated)/i.test(listing.housing))
      || (benefitFilter === "meals" && !/not (provided|included|stated)/i.test(listing.meals));
    return matchesQuery && matchesBenefit;
  });

  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Seek · populated sample inventory" title="Find a season that fits." lede="Compare the entire deal before you decide: match, dates, housing, meals, pay, location, and the host behind the role." />
      <form className={styles.filterBar} onSubmit={(event) => event.preventDefault()} role="search">
        <label><span>Search roles or places</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try guest services" /></label>
        <label><span>Benefit</span><select value={benefitFilter} onChange={(event) => setBenefitFilter(event.target.value)}><option value="all">All roles</option><option value="housing">Housing stated</option><option value="meals">Meals stated</option></select></label>
        <output>{listings.length} match{listings.length === 1 ? "" : "es"}</output>
      </form>
      {notice ? <InlineNotice message={notice} /> : null}
      {listings.length > 0 ? (
        <div className={styles.cardGrid}>{listings.map((listing) => <DiscoveryListingCard key={listing.id} listing={listing} onAfterAction={setNotice} />)}</div>
      ) : (
        <section className={styles.emptyState}><h2>No roles in this view</h2><p>Clear the filters or reset the demo to restore skipped roles.</p><button type="button" className={styles.secondaryButton} onClick={() => { setQuery(""); setBenefitFilter("all"); }}>Clear filters</button></section>
      )}
    </div>
  );
}

function SwipeSurface() {
  const { appliedIds, savedIds, skippedIds } = useDemoSeekerSession();
  const visible = seekerDemoListings.filter((listing) =>
    !skippedIds.includes(listing.id) && !appliedIds.includes(listing.id) && !savedIds.includes(listing.id),
  );
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const listing = visible[index % Math.max(1, visible.length)];

  function advance(message: string, action: "skip" | "save" | "apply") {
    setNotice(message);
    if (action === "apply") return;
  }

  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Swipe · one decision at a time" title="Focus on the next role." lede="The same complete opportunity card, narrowed to one choice. Skip takes 20%, Apply takes 60%, and Save takes 20% of the action row." action={<Link className={styles.secondaryLink} href={`${DEMO_ROOT}/seek`}>See every match</Link>} />
      {notice ? <InlineNotice message={notice} /> : null}
      {listing ? (
        <div className={styles.swipeStage}>
          <p className={styles.queueCount}>{(index % visible.length) + 1} of {visible.length} unskipped roles</p>
          <DiscoveryListingCard listing={listing} onAfterAction={advance} />
          <button type="button" className={styles.textButton} onClick={() => setIndex((current) => current + 1)}>Show another role →</button>
        </div>
      ) : (
        <section className={styles.emptyState}><h2>You reached the end of this sample deck</h2><p>Reset the demo from the banner to walk it again.</p></section>
      )}
    </div>
  );
}

function MapSurface() {
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Map · provider-safe walkthrough" title="See where the season happens." lede="This spatial overview keeps the listing geography visible without pretending a live map provider is connected. Positions are illustrative; every location label comes from the sample listing." action={<Link className={styles.secondaryLink} href={`${DEMO_ROOT}/seek`}>Open list view</Link>} />
      <div className={styles.mapLayout}>
        <section className={styles.staticMap} aria-label="Illustrative spatial overview of demo listings">
          <div className={styles.mapWater} aria-hidden="true" />
          <div className={styles.mapRoadA} aria-hidden="true" />
          <div className={styles.mapRoadB} aria-hidden="true" />
          <p className={styles.mapDisclosure}><strong>Static sample geography</strong><br />No provider map, geolocation, or live directions are active in this walkthrough.</p>
          {seekerDemoListings.map((listing, index) => (
            <Link
              key={listing.id}
              href={`${DEMO_ROOT}/listing/${listing.id}`}
              className={styles.mapPin}
              style={{ left: `${18 + (index * 19) % 64}%`, top: `${20 + (index * 23) % 58}%` }}
              aria-label={`Open ${listing.title} in ${listing.location}`}
            >
              <span>{index + 1}</span>
            </Link>
          ))}
        </section>
        <ol className={styles.mapList}>
          {seekerDemoListings.map((listing, index) => (
            <li key={listing.id}>
              <span className={styles.mapIndex}>{index + 1}</span>
              <div><strong>{listing.title}</strong><span>{listing.location} · {listing.matchScore}% match</span></div>
              <Link href={`${DEMO_ROOT}/listing/${listing.id}`}>Details</Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const GALLERY_CATEGORIES: readonly {
  readonly category: PhotoCategory;
  readonly label: string;
  readonly description: string;
}[] = [
  { category: "workplace", label: "Workplace", description: "The role’s work setting" },
  { category: "housing", label: "Housing", description: "The host’s staff housing library" },
  { category: "meals", label: "Meals", description: "The stated staff meal setup" },
  { category: "location", label: "Location", description: "The surrounding destination" },
];

function ListingNextStep({ listing }: { readonly listing: SeekerDemoListing }) {
  const { appliedIds, savedIds, save } = useDemoSeekerSession();
  const applied = appliedIds.includes(listing.id);
  const saved = savedIds.includes(listing.id);
  return (
    <section className={styles.lateCta} aria-labelledby="listing-next-step">
      <div>
        <p className={styles.eyebrow}>Next step</p>
        <h2 id="listing-next-step">{applied ? "Track your sample application." : "Ready to make a considered choice?"}</h2>
        <p>{applied ? "The host has not been contacted. Follow the session-only lifecycle from Applications." : "Save this role for later or review the populated profile that will accompany your application."}</p>
      </div>
      <div className={styles.lateCtaActions}>
        <button type="button" className={styles.secondaryButton} aria-pressed={saved} onClick={() => save(listing.id)}>
          {saved ? "Remove saved role" : "Save this role"}
        </button>
        <Link className={styles.primaryLink} href={applied ? `${DEMO_ROOT}/applications` : `${DEMO_ROOT}/listing/${listing.id}/apply`}>
          {applied ? "View applications" : "Review profile & apply"}
        </Link>
      </div>
    </section>
  );
}

function SampleWeather({ location }: { readonly location: string }) {
  return (
    <section className={styles.detailSection} aria-labelledby="weather-heading">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>Weather</p><h2 id="weather-heading">10-day sample outlook</h2></div>
        <StatusChip tone="attention">Not live</StatusChip>
      </div>
      <p className={styles.disclosure}>{seekerDemoWeatherDisclosure} Location context: {location}.</p>
      <div className={styles.weatherStrip}>
        {seekerDemoWeatherDays.map((day) => <div key={day.id}><strong>{formatDemoDate(day.date, { weekday: "short" })}</strong><span>{day.condition}</span><b>{day.highF}°</b><small>{day.lowF}°</small></div>)}
      </div>
    </section>
  );
}

function ListingSurface() {
  const params = useParams<{ id?: string | string[] }>();
  const listing = listingById(routeParam(params?.id));
  const [benefit, setBenefit] = useState<BenefitKind | null>(null);
  const [notice, setNotice] = useState("");
  if (!listing) return <MissingSurface title="Listing unavailable" />;

  return (
    <div className={styles.surface}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href={`${DEMO_ROOT}/seek`}>Seek</Link><span>/</span><span>{listing.title}</span></nav>
      <section className={styles.listingHero}>
        <ListingPhoto listing={listing} className={styles.heroPhoto} />
        <div className={styles.heroBody}>
          <div className={styles.heroChips}><StatusChip tone="positive">{listing.matchScore}% match</StatusChip><StatusChip>{listing.status}</StatusChip></div>
          <h1>{listing.title}</h1>
          <p className={styles.heroHost}>at <Link href={`${DEMO_ROOT}/host/${seekerDemoHost.id}`}>{seekerDemoHost.name}</Link> · {listing.location}</p>
          <p>{listing.summary}</p>
          <div className={styles.dateGrid}><div><small>Begins</small><strong>{formatDemoDate(listing.startDate)}</strong></div><div><small>Ends</small><strong>{formatDemoDate(listing.endDate)}</strong></div><div><small>Season length</small><strong>{seasonLength(listing)}</strong></div><div><small>Listing closes</small><strong>{formatDemoDate(listing.deadline)}</strong></div></div>
          <div className={styles.detailTriad}>
            <button type="button" onClick={() => setBenefit("housing")}><small>Housing</small><strong>{listing.housing}</strong><span>See details →</span></button>
            <button type="button" onClick={() => setBenefit("meals")}><small>Meals</small><strong>{listing.meals}</strong><span>See details →</span></button>
            <button type="button" onClick={() => setBenefit("pay")}><small>Pay</small><strong>{listing.pay}</strong><span>See details →</span></button>
          </div>
          <ActionBar listing={listing} onAfterAction={setNotice} />
          {notice ? <InlineNotice message={notice} /> : null}
        </div>
      </section>

      <section className={styles.gallerySection} aria-labelledby="gallery-heading">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>See the whole setup</p><h2 id="gallery-heading">Four role photo categories</h2></div><StatusChip>Sample gallery</StatusChip></div>
        <div className={styles.galleryGrid}>{GALLERY_CATEGORIES.map(({ category, label, description }) => <figure key={category}><ListingPhoto listing={listing} category={category} /><figcaption><strong>{label}</strong><span>{description}</span></figcaption></figure>)}</div>
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.detailSection}><p className={styles.eyebrow}>About the position</p><h2>The work</h2><p>{listing.description}</p><h3>Responsibilities</h3><ul>{listing.responsibilities.map((responsibility) => <li key={responsibility}>{responsibility}</li>)}</ul><h3>What helps you thrive</h3><ul>{listing.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul><h3>Training and role benefits</h3><ul>{[...listing.training, ...listing.benefits].map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className={styles.detailSection}><p className={styles.eyebrow}>About the location</p><h2>{listing.location}</h2><p>{listing.locationDetails.summary}</p><p>{listing.locationDetails.remoteness}</p><h3>Getting around</h3><ul>{listing.locationDetails.transportation.map((item) => <li key={item}>{item}</li>)}</ul><h3>Nearby services</h3><div className={styles.skillList}>{listing.locationDetails.nearbyServices.map((item) => <span key={item}>{item}</span>)}</div><h3>Life outside work</h3><ul>{listing.locationDetails.activities.map((item) => <li key={item}>{item}</li>)}</ul><Link className={styles.textLink} href={`${DEMO_ROOT}/map`}>Place it in the spatial overview →</Link></section>
      </div>

      <section className={styles.detailSection} aria-labelledby="company-team-heading">
        <p className={styles.eyebrow}>About the company and team</p>
        <h2 id="company-team-heading">{seekerDemoHost.name}</h2>
        {seekerDemoHost.story.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <h3>How the team is managed</h3>
        <p>{seekerDemoHost.managementApproach}</p>
        <div className={styles.teamGrid}>{seekerDemoHost.team.map((member) => <article key={member.id} className={styles.teamCard}><span className={styles.hostInitials}>{member.initials}</span><div><strong>{member.name}</strong><small>{member.role}</small><p>{member.bio}</p></div></article>)}</div>
      </section>

      <section className={styles.hostCallout}>
        <div className={styles.hostInitials}>{seekerDemoHost.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("")}</div>
        <div><p className={styles.eyebrow}>Your potential host</p><h2>{seekerDemoHost.name}</h2><p>{seekerDemoHost.tagline}</p></div>
        <Link className={styles.secondaryLink} href={`${DEMO_ROOT}/host/${seekerDemoHost.id}`}>View full host profile</Link>
      </section>

      <SampleWeather location={listing.location} />
      <ListingNextStep listing={listing} />
      {benefit ? <BenefitDialog listing={listing} kind={benefit} onClose={() => setBenefit(null)} /> : null}
    </div>
  );
}

function ApplySurface() {
  const params = useParams<{ id?: string | string[] }>();
  const listing = listingById(routeParam(params?.id));
  const { appliedIds, apply, profile } = useDemoSeekerSession();
  const [step, setStep] = useState<"profile" | "confirm" | "done">("profile");
  const [acknowledged, setAcknowledged] = useState(false);
  if (!listing) return <MissingSurface title="Listing unavailable" />;

  const alreadyApplied = appliedIds.includes(listing.id);
  const seededApplication = seekerDemoApplications.find((application) => application.listingId === listing.id);
  const applicationId = seededApplication?.id ?? `demo_local_application_${listing.id}`;
  const readiness = profileReadiness(profile);
  const selectedListingId = listing.id;

  if (alreadyApplied && step !== "done") {
    return (
      <div className={styles.surface}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href={`${DEMO_ROOT}/listing/${listing.id}`}>{listing.title}</Link><span>/</span><span>Apply</span></nav>
        <section className={styles.emptyState}><StatusChip tone="positive">Already submitted in demo</StatusChip><h1>Your sample application is in the lifecycle.</h1><p>No host or provider was contacted. Continue from the application record stored in this browser tab.</p><Link className={styles.primaryLink} href={`${DEMO_ROOT}/applications/${applicationId}`}>View sample application</Link></section>
      </div>
    );
  }

  function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acknowledged) return;
    apply(selectedListingId);
    setStep("done");
  }

  return (
    <div className={styles.surface}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href={`${DEMO_ROOT}/listing/${listing.id}`}>{listing.title}</Link><span>/</span><span>Apply</span></nav>
      <SurfaceHeader eyebrow="Apply · profile-led and session only" title={step === "done" ? "Sample application submitted." : `Apply for ${listing.title}`} lede="Review what the host will see, confirm the role terms, then submit only into this isolated walkthrough." />

      {step === "profile" ? (
        <section className={styles.applyStep} aria-labelledby="profile-review-heading">
          <div className={styles.stepMarker}>1 of 2</div>
          <div><p className={styles.eyebrow}>Profile review</p><h2 id="profile-review-heading">This is the profile attached to the application.</h2><p>{profile.intro}</p><dl className={styles.definitionList}><div><dt>Readiness</dt><dd>{readiness}%</dd></div><div><dt>Availability</dt><dd>{profile.availability}</dd></div><div><dt>Housing</dt><dd>{profile.housingNeeded ? "Needed" : "Not needed"}</dd></div><div><dt>Certifications</dt><dd>{profile.certifications.length > 0 ? profile.certifications.join(" · ") : "None added"}</dd></div></dl><div className={styles.skillList}>{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>
          <div className={styles.applyActions}><Link className={styles.secondaryLink} href={profileEditHrefForApplication(listing.id)}>Edit sample profile</Link><button type="button" className={styles.primaryButton} onClick={() => setStep("confirm")}>Continue to confirmation</button></div>
        </section>
      ) : null}

      {step === "confirm" ? (
        <form className={styles.applyStep} onSubmit={submitApplication} aria-labelledby="application-confirm-heading">
          <div className={styles.stepMarker}>2 of 2</div>
          <div><p className={styles.eyebrow}>Confirmation</p><h2 id="application-confirm-heading">Confirm the complete sample deal.</h2><dl className={styles.definitionList}><div><dt>Role</dt><dd>{listing.title}</dd></div><div><dt>Season</dt><dd>{formatDemoDate(listing.startDate)}–{formatDemoDate(listing.endDate)}</dd></div><div><dt>Housing</dt><dd>{listing.housing}</dd></div><div><dt>Meals</dt><dd>{listing.meals}</dd></div><div><dt>Pay</dt><dd>{listing.pay}</dd></div></dl><label className={styles.confirmCheck}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this submission stays inside the fictional walkthrough and contacts no host, email, SMS, payment, map, or authentication provider.</span></label></div>
          <div className={styles.applyActions}><button type="button" className={styles.secondaryButton} onClick={() => setStep("profile")}>Back to profile</button><button type="submit" className={styles.primaryButton} disabled={!acknowledged}>Submit sample application</button></div>
        </form>
      ) : null}

      {step === "done" ? (
        <>
          <section className={styles.emptyState}><StatusChip tone="positive">Session-only submission</StatusChip><h2>Application added to your sample lifecycle.</h2><p>Nothing was transmitted. The application now appears under Applications and the role has left discovery.</p><div className={styles.linkRow}><Link className={styles.secondaryLink} href={`${DEMO_ROOT}/applications`}>All applications</Link><Link className={styles.primaryLink} href={`${DEMO_ROOT}/applications/${applicationId}`}>View this application</Link></div></section>
          <section className={styles.lateCta} aria-labelledby="apply-conversion-heading">
            <div><p className={styles.eyebrow}>Ready when the fit feels real</p><h2 id="apply-conversion-heading">Join Explore &amp; Earn to apply for real roles.</h2><p>Build your profile once, then carry your skills, season preferences, and work history into every application.</p></div>
            <div className={styles.lateCtaActions}><Link className={styles.secondaryLink} href={`${DEMO_ROOT}/seek`}>Explore more roles</Link><Link className={styles.primaryLink} href="/sign-up?role=seeker">Join as a seeker</Link></div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function HostSurface() {
  const hostCreatedAt = /^\d{4}$/.test(seekerDemoHost.hostSince)
    ? `${seekerDemoHost.hostSince}-01-01T00:00:00.000Z`
    : seekerDemoHost.hostSince;
  const host: PublicHostProfile = {
    id: seekerDemoHost.id,
    companyName: seekerDemoHost.name,
    hostName: seekerDemoHost.team[0]?.name ?? null,
    tagline: seekerDemoHost.tagline,
    about: seekerDemoHost.story,
    primaryLocationName: seekerDemoHost.location,
    photoUrl: seekerDemoHost.logoUrl,
    websiteUrl: null,
    socialLinks: { instagram: null, twitter: null },
    categoryScopes: [...new Set(seekerDemoListings.map((listing) => listing.category))],
    housingOfferedGenerally: seekerDemoListings.some((listing) => listing.housingProvision === "provided"),
    mealsOfferedGenerally: seekerDemoListings.some((listing) => listing.mealsProvision === "provided"),
    verified: seekerDemoHost.verified,
    createdAt: hostCreatedAt,
    whyWorkForUs: seekerDemoHost.mission,
    team: seekerDemoHost.team.map((member) => ({ name: member.name, role: member.role })),
    activities: [...seekerDemoHost.primaryLocation.activities],
    perks: [...seekerDemoHost.benefits],
    culture: [...seekerDemoHost.culture],
    managementApproach: seekerDemoHost.managementApproach,
    seasonRhythm: [...seekerDemoHost.seasonRhythm],
    training: [...seekerDemoHost.training],
    transportation: [...seekerDemoHost.primaryLocation.transportation],
    remoteness: seekerDemoHost.primaryLocation.remoteness,
    nearbyServices: [...seekerDemoHost.primaryLocation.nearbyServices],
    housingDescription: seekerDemoListings[0]
      ? `${seekerDemoListings[0].housingDetails.summary}. ${seekerDemoListings[0].housingDetails.occupancy}; ${seekerDemoListings[0].housingDetails.distanceFromWork}.`
      : undefined,
    mealsDescription: seekerDemoListings[0]
      ? `${seekerDemoListings[0].mealsDetails.summary}. ${seekerDemoListings[0].mealsDetails.style}.`
      : undefined,
    faqs: seekerDemoHost.faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
  };
  const listings: readonly PublicHostListing[] = seekerDemoListings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    category: listing.category,
    coverPhotoUrl: listing.photos[0] ?? null,
    locationDisplay: listing.location,
    latitude: null,
    longitude: null,
    housingIncluded: listing.housingProvision === "provided",
    mealsIncluded: listing.mealsProvision === "provided",
    compensationSummary: listing.pay,
    compensationMinCents: null,
    compensationMaxCents: null,
    compensationUnit: null,
    compensationCurrency: DEFAULT_CURRENCY,
    publishedAt: seekerDemoNow.toISOString(),
  }));
  const ratingSummary: HostRatingSummary = {
    count: 0,
    average: 0,
    housingKeptPct: null,
    mealsKeptPct: null,
    payOnTimePct: null,
  };

  return (
    <div className={styles.canonicalHostSurface}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href={`${DEMO_ROOT}/seek`}>Seek</Link><span>/</span><span>{seekerDemoHost.name}</span></nav>
      <div className={styles.sampleProfileNote} role="note">
        Fictional host profile · no reviews, live map links, or production records are attached.
      </div>
      <PublicHostProfileView
        host={host}
        listings={listings}
        ratingSummary={ratingSummary}
        reviews={[]}
        coverPhotoUrl={seekerDemoHost.coverImageUrl}
        browseHref={`${DEMO_ROOT}/seek`}
        listingHrefPrefix={`${DEMO_ROOT}/listing`}
        externalMapLinks={false}
      />
    </div>
  );
}

function ProfileSurface() {
  const { profile } = useDemoSeekerSession();
  const readiness = profileReadiness(profile);
  const portfolioHref = /^https?:\/\//i.test(profile.portfolioUrl) ? profile.portfolioUrl : null;
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Profile · sample seeker" title="Show hosts how you travel and work." lede="This is the information a seeker controls. The walkthrough does not upload, publish, or alter a real profile." action={<Link className={styles.primaryLink} href={`${DEMO_ROOT}/profile/edit`}>Edit sample profile</Link>} />
      <section className={styles.profileHero}>
        <div className={styles.profileAvatarWrap}><div className={styles.profileAvatar}><Image src={seekerDemoPerson.photoUrl} alt={seekerDemoPerson.photoAlt} fill sizes="90px" className={styles.profileAvatarImage} /></div><small>Illustrative sample profile image</small></div>
        <div><h2>{seekerDemoPerson.name}</h2><p>{seekerDemoPerson.location}</p><p>{profile.intro}</p><p><strong>Open to:</strong> {profile.openTo}</p></div>
        <div className={styles.profileScore}><strong>{readiness}%</strong><span>Profile readiness</span></div>
      </section>
      <div className={styles.detailGrid}>
        <section className={styles.detailSection}><p className={styles.eyebrow}>Availability</p><h2>Your season</h2><dl className={styles.definitionList}><div><dt>Available</dt><dd>{profile.availability}</dd></div><div><dt>Housing</dt><dd>{profile.housingNeeded ? "Needed" : "Not needed"}</dd></div><div><dt>Transportation</dt><dd>{profile.transportation}</dd></div></dl></section>
        <section className={styles.detailSection}><p className={styles.eyebrow}>Preferences</p><h2>What matters</h2><ul className={styles.benefitList}>{profile.preferences.map((preference) => <li key={preference}>{preference}</li>)}</ul></section>
      </div>
      <section className={styles.detailSection}><p className={styles.eyebrow}>Skills and certifications</p><h2>What you bring</h2><div className={styles.skillList}>{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div><h3>Certifications</h3>{profile.certifications.length > 0 ? <ul>{profile.certifications.map((certification) => <li key={certification}>{certification}</li>)}</ul> : <p>None added yet.</p>}<p className={styles.disclosure}>These fields can be edited in the walkthrough. Changes remain in this browser tab, and this public demo does not accept uploads.</p></section>
      <section className={styles.detailSection}><p className={styles.eyebrow}>Work history</p><h2>Experience</h2><div className={styles.historyList}>{profile.workHistory.map((item) => <article key={item.id} className={styles.historyCard}><div><strong>{item.role}</strong><span>{item.organization} · {item.location}</span><small>{formatDemoDate(item.startsOn, { month: "short", year: "numeric" })}–{formatDemoDate(item.endsOn, { month: "short", year: "numeric" })}</small></div><ul>{item.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul></article>)}</div></section>
      <section className={styles.detailSection}><p className={styles.eyebrow}>Optional profile details</p><h2>{portfolioHref ? "Portfolio added" : "Still optional"}</h2>{portfolioHref ? <p><a className={styles.textLink} href={portfolioHref}>Sample portfolio link</a></p> : <p>{seekerDemoPerson.optionalFieldsRemaining.join(", ")} has not been added. Optional fields do not block applying.</p>}</section>
      <section className={styles.lateCta} aria-labelledby="profile-conversion-heading">
        <div><p className={styles.eyebrow}>Ready for your own season?</p><h2 id="profile-conversion-heading">Build a seeker profile hosts can understand quickly.</h2><p>Bring your availability, skills, housing needs, and work story together before you apply.</p></div>
        <div className={styles.lateCtaActions}><Link className={styles.secondaryLink} href={`${DEMO_ROOT}/seek`}>Keep exploring</Link><Link className={styles.primaryLink} href="/sign-up?role=seeker">Build your seeker profile</Link></div>
      </section>
    </div>
  );
}

function ProfileEditSurface({ pendingApplicationListingId }: { readonly pendingApplicationListingId?: string }) {
  const { profile, updateProfile } = useDemoSeekerSession();
  const router = useRouter();
  const pendingListing = pendingApplicationListingId
    ? seekerDemoListings.find((listing) => listing.id === pendingApplicationListingId)
    : undefined;
  const returnHref = pendingListing
    ? applicationHrefForListing(pendingListing.id)
    : `${DEMO_ROOT}/profile`;
  const [intro, setIntro] = useState(profile.intro);
  const [openTo, setOpenTo] = useState(profile.openTo);
  const [availability, setAvailability] = useState(profile.availability);
  const [preferences, setPreferences] = useState(profile.preferences.join("\n"));
  const [housingNeeded, setHousingNeeded] = useState(profile.housingNeeded);
  const [transportation, setTransportation] = useState(profile.transportation);
  const [skills, setSkills] = useState(profile.skills.join(", "));
  const [certifications, setCertifications] = useState(profile.certifications.join("\n"));
  const [portfolioUrl, setPortfolioUrl] = useState(profile.portfolioUrl);
  const [notice, setNotice] = useState("");

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const preferenceValues = preferences.split(/\n/).map((value) => value.trim()).filter(Boolean);
    const skillValues = skills.split(",").map((value) => value.trim()).filter(Boolean);
    const certificationValues = certifications.split(/\n/).map((value) => value.trim()).filter(Boolean);
    if (!intro.trim() || !availability.trim() || skillValues.length === 0) {
      setNotice("Add an introduction, availability, and at least one skill.");
      return;
    }
    updateProfile({
      intro: intro.trim(),
      openTo: openTo.trim() || "Open to opportunities that match this profile",
      availability: availability.trim(),
      preferences: preferenceValues,
      housingNeeded,
      transportation: transportation.trim() || "Transportation not stated",
      skills: skillValues,
      certifications: certificationValues,
      workHistory: profile.workHistory,
      portfolioUrl: portfolioUrl.trim(),
    });
    if (pendingListing) {
      router.push(returnHref);
      return;
    }
    setNotice("Sample profile updated in this browser tab. Nothing was published.");
  }

  return (
    <div className={styles.surface}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href={returnHref}>{pendingListing ? pendingListing.title : "Profile"}</Link><span>/</span><span>{pendingListing ? "Application profile" : "Edit"}</span></nav>
      <SurfaceHeader eyebrow="Edit profile · session only" title="Shape your sample profile." lede={pendingListing ? `Save your changes, then return to the application for ${pendingListing.title}.` : "Try the full profile-editing flow without uploading a file or changing a real account."} />
      <form className={styles.profileForm} onSubmit={saveProfile}>
        <label className={styles.fullField}><span>Introduction</span><textarea rows={5} value={intro} onChange={(event) => setIntro(event.target.value)} /></label>
        <label className={styles.fullField}><span>Open-to statement</span><input value={openTo} onChange={(event) => setOpenTo(event.target.value)} /></label>
        <label className={styles.fullField}><span>Availability</span><input value={availability} onChange={(event) => setAvailability(event.target.value)} /></label>
        <label><span>Housing</span><select value={housingNeeded ? "needed" : "not_needed"} onChange={(event) => setHousingNeeded(event.target.value === "needed")}><option value="needed">I need host housing</option><option value="not_needed">I have housing</option></select></label>
        <label><span>Transportation</span><input value={transportation} onChange={(event) => setTransportation(event.target.value)} /></label>
        <label className={styles.fullField}><span>Preferences · one per line</span><textarea rows={5} value={preferences} onChange={(event) => setPreferences(event.target.value)} /></label>
        <label className={styles.fullField}><span>Skills · comma separated</span><input value={skills} onChange={(event) => setSkills(event.target.value)} /></label>
        <label className={styles.fullField}><span>Certifications · one per line</span><textarea rows={3} value={certifications} onChange={(event) => setCertifications(event.target.value)} /></label>
        <label className={styles.fullField}><span>Portfolio link · optional</span><input type="url" value={portfolioUrl} onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://example.com/your-work" /></label>
        <p className={styles.formNotice} role="status" aria-live="polite">{notice}</p>
        <div className={styles.formActions}><Link className={styles.secondaryLink} href={returnHref}>{pendingListing ? "Back to application" : "Review profile"}</Link><button type="submit" className={styles.primaryButton}>{pendingListing ? "Save and return to application" : "Save sample changes"}</button></div>
      </form>
    </div>
  );
}

function SavedSurface() {
  const { savedIds } = useDemoSeekerSession();
  const [notice, setNotice] = useState("");
  const saved = seekerDemoListings.filter((listing) => savedIds.includes(listing.id));
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Saved · your shortlist" title="Keep the promising ones close." lede="Saved roles stay in this walkthrough session only, ready to compare before you apply." action={<Link className={styles.primaryLink} href={`${DEMO_ROOT}/seek`}>Find more roles</Link>} />
      {notice ? <InlineNotice message={notice} /> : null}
      {saved.length > 0 ? <div className={styles.cardGrid}>{saved.map((listing) => <DiscoveryListingCard key={listing.id} listing={listing} onAfterAction={setNotice} />)}</div> : <section className={styles.emptyState}><h2>Your sample shortlist is empty</h2><p>Save a role from Seek or Swipe and it will appear here immediately.</p><Link className={styles.primaryLink} href={`${DEMO_ROOT}/seek`}>Browse roles</Link></section>}
    </div>
  );
}

function ApplicationRow({ application, local = false }: { readonly application: SeekerDemoApplication; readonly local?: boolean }) {
  const listing = listingById(application.listingId);
  if (!listing) return null;
  const status = applicationStatus(application.status);
  const interview = seekerDemoInterviews.find((entry) => entry.applicationId === application.id);
  return (
    <article className={styles.applicationRow}>
      <ListingPhoto listing={listing} />
      <div><div className={styles.rowTop}><StatusChip tone={status.tone}>{status.label}</StatusChip>{local ? <StatusChip>Demo action</StatusChip> : null}</div><h2>{listing.title}</h2><p>{seekerDemoHost.name} · {listing.location}</p><small>{local ? `Submitted ${formatDemoDate(application.submittedAt)} inside this walkthrough; nothing sent` : `Submitted ${formatDemoDate(application.submittedAt)}`}</small>{interview ? <p className={styles.nextStep}>Next: interview {formatDemoDate(interview.startsAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p> : null}</div>
      <Link className={styles.secondaryLink} href={`${DEMO_ROOT}/applications/${application.id}`}>View application</Link>
    </article>
  );
}

function applicationRecords(localApplications: readonly DemoLocalApplication[]): readonly { application: SeekerDemoApplication; local: boolean }[] {
  const local = localApplications.map(({ listingId, submittedAt }) => ({
    application: {
      id: `demo_local_application_${listingId}`,
      seekerId: seekerDemoPerson.id,
      listingId,
      status: "submitted",
      submittedAt,
      updatedAt: submittedAt,
    },
    local: true,
  }));
  return [...seekerDemoApplications.map((application) => ({ application, local: false })), ...local];
}

function ApplicationsSurface() {
  const { localApplications } = useDemoSeekerSession();
  const rows = applicationRecords(localApplications);
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Applications · real lifecycle language" title="Know where every application stands." lede="Application status and interview scheduling remain separate: an interview is a scheduled next step, not a made-up pipeline stage." action={<Link className={styles.primaryLink} href={`${DEMO_ROOT}/schedule`}>Your schedule</Link>} />
      <div className={styles.applicationList}>{rows.map(({ application, local }) => <ApplicationRow key={application.id} application={application} local={local} />)}</div>
    </div>
  );
}

function ApplicationSurface() {
  const params = useParams<{ id?: string | string[] }>();
  const id = routeParam(params?.id);
  const { localApplications } = useDemoSeekerSession();
  const records = applicationRecords(localApplications);
  const record = records.find((entry) => entry.application.id === id);
  const application = record?.application ?? applicationById(id);
  const listing = listingById(application?.listingId);
  if (!application || !listing) return <MissingSurface title="Application unavailable" />;
  const interview = seekerDemoInterviews.find((entry) => entry.applicationId === application.id);
  const thread = seekerDemoThreads.find((entry) => entry.listingId === listing.id);
  const status = applicationStatus(application.status);

  return (
    <div className={styles.surface}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href={`${DEMO_ROOT}/applications`}>Applications</Link><span>/</span><span>{listing.title}</span></nav>
      <SurfaceHeader eyebrow="Application detail" title={listing.title} lede={`${seekerDemoHost.name} · ${listing.location}`} action={<StatusChip tone={status.tone}>{status.label}</StatusChip>} />
      <section className={styles.applicationDetail}>
        <div><p className={styles.eyebrow}>Current status</p><h2>{status.label}</h2><p>{record?.local ? `You reviewed and submitted this application inside the walkthrough on ${formatDemoDate(application.submittedAt)}. It was not sent to the host.` : `Submitted ${formatDemoDate(application.submittedAt)}. Last updated ${formatDemoDate(application.updatedAt)}.`}</p></div>
        <div className={styles.stageLine} aria-label="Application progress"><span className={styles.stageDone}>Submitted</span><span className={/review|offer|accept/i.test(application.status) ? styles.stageDone : ""}>Reviewing</span><span className={/offer|accept/i.test(application.status) ? styles.stageDone : ""}>Offered</span><span className={/accept/i.test(application.status) ? styles.stageDone : ""}>Accepted</span></div>
      </section>
      {interview ? <InterviewCard interview={interview} /> : <section className={styles.detailSection}><h2>No interview scheduled</h2><p>If the host proposes an interview, it appears on this application and in Schedule.</p></section>}
      <div className={styles.linkRow}><Link className={styles.secondaryLink} href={`${DEMO_ROOT}/listing/${listing.id}`}>Review listing</Link>{thread ? <Link className={styles.primaryLink} href={`${DEMO_ROOT}/messages/${thread.id}`}>Message host about this role</Link> : <span className={styles.disclosure}>No conversation exists for this application yet. Messaging appears only after a role-linked thread exists.</span>}</div>
    </div>
  );
}

function MessagesSurface() {
  const { isThreadUnread, unreadMessageCount } = useDemoSeekerSession();
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow={`Messages · ${unreadMessageCount} unread`} title="Keep each host conversation attached to the role." lede="Replies are stored only in this walkthrough session. No host, email, SMS, or notification provider is contacted." />
      {seekerDemoThreads.length > 0 ? <div className={styles.threadList}>{seekerDemoThreads.map((thread) => { const listing = listingById(thread.listingId); const last = thread.messages.at(-1); return <Link key={thread.id} href={`${DEMO_ROOT}/messages/${thread.id}`} className={styles.threadRow}><span className={styles.hostInitials}>{thread.hostName.split(/\s+/).map((word) => word[0]).slice(0, 2).join("")}</span><div><span>{listing?.title ?? thread.subject}</span><strong>{thread.hostName}</strong><p>{last?.body ?? "Open this conversation"}</p></div><small>{last ? formatDemoDate(last.sentAt, { month: "short", day: "numeric" }) : ""}</small>{isThreadUnread(thread.id) ? <i>New</i> : null}</Link>; })}</div> : <section className={styles.emptyState}><h2>No sample conversations</h2><p>Messages appear after a host or seeker starts a conversation about a role.</p></section>}
    </div>
  );
}

function ThreadSurface() {
  const params = useParams<{ id?: string | string[] }>();
  const thread = threadById(routeParam(params?.id));
  const { sentMessages, sendMessage, markThreadRead, ready } = useDemoSeekerSession();
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const resolvedThreadId = thread?.id;
  useEffect(() => {
    if (ready && resolvedThreadId) markThreadRead(resolvedThreadId);
  }, [markThreadRead, ready, resolvedThreadId]);
  if (!thread) return <MissingSurface title="Conversation unavailable" />;
  const threadId = thread.id;
  const listing = listingById(thread.listingId);
  const messages = [...thread.messages, ...(sentMessages[threadId] ?? [])];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) {
      setNotice("Write a message before sending.");
      return;
    }
    sendMessage(threadId, draft);
    setDraft("");
    setNotice("Added to this sample conversation only. Nothing was sent.");
  }

  return (
    <div className={styles.surface}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href={`${DEMO_ROOT}/messages`}>Messages</Link><span>/</span><span>{thread.hostName}</span></nav>
      <SurfaceHeader eyebrow="Conversation" title={listing?.title ?? thread.subject} lede={`${thread.hostName} · sample messages`} action={listing ? <Link className={styles.secondaryLink} href={`${DEMO_ROOT}/listing/${listing.id}`}>View role</Link> : null} />
      <section className={styles.transcript} aria-label={`Messages with ${thread.hostName}`}>
        {messages.map((message) => <article key={message.id} className={message.sender === "seeker" ? styles.messageMine : styles.messageTheirs}><strong>{message.sender === "seeker" ? "You" : message.senderName}</strong><p>{message.body}</p><time dateTime={message.sentAt}>{formatDemoDate(message.sentAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></article>)}
      </section>
      <form className={styles.composer} onSubmit={submit}><label htmlFor="demo-message">Reply in this walkthrough</label><textarea id="demo-message" value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Ask about the role, housing, or arrival…" /><div><p aria-live="polite">{notice}</p><button type="submit" className={styles.primaryButton}>Add sample reply</button></div></form>
    </div>
  );
}

function NotificationsSurface() {
  const { readNotificationIds, markNotificationRead, markAllNotificationsRead } = useDemoSeekerSession();
  const unread = seekerDemoNotifications.filter((notification) => !notification.read && !readNotificationIds.includes(notification.id)).length;
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Notifications · account activity" title="Updates with a clear destination." lede={`${unread} unread sample update${unread === 1 ? "" : "s"}. Reading one changes only this walkthrough session.`} action={<button type="button" className={styles.secondaryButton} onClick={markAllNotificationsRead} disabled={unread === 0}>Mark all read</button>} />
      <div className={styles.notificationList}>{seekerDemoNotifications.map((notification) => { const read = notification.read || readNotificationIds.includes(notification.id); return <article key={notification.id} className={read ? styles.notificationRead : styles.notificationUnread}><div><StatusChip tone={read ? "neutral" : "attention"}>{read ? "Read" : "New"}</StatusChip><h2>{notification.title}</h2><p>{notification.body}</p><time dateTime={notification.createdAt}>{formatDemoDate(notification.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div><div>{!read ? <button type="button" className={styles.textButton} onClick={() => markNotificationRead(notification.id)}>Mark read</button> : null}<Link className={styles.secondaryLink} href={notification.href} onClick={() => markNotificationRead(notification.id)}>Open</Link></div></article>; })}</div>
    </div>
  );
}

function InterviewCard({ interview }: { readonly interview: SeekerDemoInterview }) {
  const application = seekerDemoApplications.find((entry) => entry.id === interview.applicationId);
  const listing = listingById(application?.listingId);

  function downloadCalendar() {
    const start = new Date(interview.startsAt);
    const end = new Date(start.getTime() + interview.durationMinutes * 60_000);
    const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Explore and Earn//Sample Walkthrough//EN",
      "BEGIN:VEVENT",
      `UID:${interview.id}@demo.exploreandearn.com`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:Sample interview - ${listing?.title ?? "Seasonal role"}`,
      "DESCRIPTION:Walkthrough sample only. This is not a confirmed real interview.",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "explore-and-earn-sample-interview.ics";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className={styles.interviewCard}>
      <div className={styles.calendarDate}><strong>{formatDemoDate(interview.startsAt, { month: "short" })}</strong><span>{formatDemoDate(interview.startsAt, { day: "numeric" })}</span></div>
      <div><p className={styles.eyebrow}>Scheduled interview · sample</p><h2>{listing?.title ?? "Seasonal role"}</h2><p>{formatDemoDate(interview.startsAt, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} · {interview.durationMinutes} minutes · {interview.format}</p><small>{interview.notes}</small></div>
      <div className={styles.interviewActions}>{application ? <Link className={styles.secondaryLink} href={`${DEMO_ROOT}/applications/${application.id}`}>Application</Link> : null}<button type="button" className={styles.primaryButton} onClick={downloadCalendar}>Download sample .ics</button></div>
    </article>
  );
}

function ScheduleSurface() {
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Schedule · interviews" title="Your next conversations, in one place." lede="Interview records are attached to applications. Calendar downloads are explicitly sample events and no external calendar is changed." action={<Link className={styles.secondaryLink} href={`${DEMO_ROOT}/applications`}>Applications</Link>} />
      {seekerDemoInterviews.length > 0 ? <div className={styles.scheduleList}>{seekerDemoInterviews.map((interview) => <InterviewCard key={interview.id} interview={interview} />)}</div> : <section className={styles.emptyState}><h2>No interviews scheduled</h2><p>When a host schedules one, it appears here and on the related application.</p></section>}
    </div>
  );
}

function AssistantSurface() {
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Assistant · public walkthrough boundary" title="Guidance without pretending AI is active." lede="The signed-in product can offer contextual assistance. This public sample does not call an AI provider, retain prompts, or suggest that generated advice is live." />
      <section className={styles.attentionCard}><div><p className={styles.eyebrow}>Try the product journey instead</p><h2>Compare the complete deal.</h2><p>Use Seek to filter populated roles, inspect housing and meals, then review your profile before a session-only application.</p></div><Link className={styles.primaryLink} href={`${DEMO_ROOT}/seek`}>Open Seek</Link></section>
    </div>
  );
}

function ResumeSurface() {
  const { profile } = useDemoSeekerSession();
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Résumé · generated from the sample profile" title={`${seekerDemoPerson.name}’s experience`} lede="This résumé view is assembled from the same editable sample profile. No PDF, upload, or external document service is used." action={<Link className={styles.secondaryLink} href={`${DEMO_ROOT}/profile/edit`}>Edit source profile</Link>} />
      <section className={styles.detailSection}><h2>{profile.openTo}</h2><p>{profile.intro}</p><div className={styles.skillList}>{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>
      <section className={styles.detailSection}><p className={styles.eyebrow}>Experience</p><div className={styles.historyList}>{profile.workHistory.map((item) => <article key={item.id} className={styles.historyCard}><div><strong>{item.role}</strong><span>{item.organization} · {item.location}</span><small>{formatDemoDate(item.startsOn, { month: "short", year: "numeric" })}–{formatDemoDate(item.endsOn, { month: "short", year: "numeric" })}</small></div><ul>{item.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul></article>)}</div></section>
      <section className={styles.detailSection}><p className={styles.eyebrow}>Credentials</p><h2>Certifications</h2>{profile.certifications.length > 0 ? <ul>{profile.certifications.map((certification) => <li key={certification}>{certification}</li>)}</ul> : <p>No certification is stated in this sample profile.</p>}</section>
    </div>
  );
}

function InvitesSurface() {
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Invites · host-initiated opportunities" title="No invitation is assigned to this sample seeker." lede="The scenario contains host outreach to other fictional candidates, but showing it here would cross candidate identity. An invite appears only when its seeker ID matches this account." />
      <section className={styles.emptyState}><h2>Keep exploring while you wait.</h2><p>Direct discovery remains available and does not require an invite.</p><Link className={styles.primaryLink} href={`${DEMO_ROOT}/seek`}>Browse matched roles</Link></section>
    </div>
  );
}

type ApplicationSubset = "offers" | "accepted" | "notSelected" | "withdrawn";

const APPLICATION_SUBSET_COPY: Readonly<Record<ApplicationSubset, {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly empty: string;
  readonly matches: (status: string) => boolean;
}>> = {
  offers: { eyebrow: "Offers", title: "Offers ready for a decision.", lede: "Offer records remain separate from interviews and applications.", empty: "No active offer is attached to this sample seeker.", matches: (status) => status.toLowerCase() === "offered" },
  accepted: { eyebrow: "Accepted", title: "Committed seasons.", lede: "Only explicitly accepted records appear here.", empty: "This sample seeker has not accepted an offer.", matches: (status) => status.toLowerCase() === "accepted" },
  notSelected: { eyebrow: "Not selected", title: "Closed application outcomes.", lede: "A host decision is shown only when the application data explicitly records it.", empty: "No not-selected outcome is present in this sample account.", matches: (status) => /not[_ ]selected|rejected/i.test(status) },
  withdrawn: { eyebrow: "Withdrawn", title: "Applications you stepped away from.", lede: "Withdrawn records are retained as lifecycle history and never relabeled as host decisions.", empty: "No withdrawn application is present in this sample account.", matches: (status) => status.toLowerCase() === "withdrawn" },
};

function ApplicationSubsetSurface({ subset }: { readonly subset: ApplicationSubset }) {
  const { localApplications } = useDemoSeekerSession();
  const copy = APPLICATION_SUBSET_COPY[subset];
  const rows = applicationRecords(localApplications).filter(({ application }) => copy.matches(application.status));
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow={copy.eyebrow} title={copy.title} lede={copy.lede} action={<Link className={styles.secondaryLink} href={`${DEMO_ROOT}/applications`}>All applications</Link>} />
      {rows.length > 0 ? <div className={styles.applicationList}>{rows.map(({ application, local }) => <ApplicationRow key={application.id} application={application} local={local} />)}</div> : <section className={styles.emptyState}><h2>{copy.empty}</h2><p>The walkthrough does not manufacture a lifecycle state when the scenario has none.</p><Link className={styles.primaryLink} href={`${DEMO_ROOT}/applications`}>Review active applications</Link></section>}
    </div>
  );
}

function CommunitySurface() {
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Community · read-only sample" title="Updates from hosts you may follow." lede="The public walkthrough shows populated announcements but does not publish, react, purchase, or contact a community provider." />
      <div className={styles.notificationList}>{seekerDemoAnnouncements.map((announcement) => <article key={announcement.id} className={styles.notificationRead}><div><StatusChip>Host announcement</StatusChip><h2>{announcement.title}</h2><p>{announcement.body}</p><time dateTime={announcement.publishedAt}>{announcement.hostName} · {formatDemoDate(announcement.publishedAt)}</time></div><div><Link className={styles.secondaryLink} href={`${DEMO_ROOT}/host/${seekerDemoHost.id}`}>Host profile</Link></div></article>)}</div>
    </div>
  );
}

function JourneySurface() {
  const { localApplications } = useDemoSeekerSession();
  const rows = applicationRecords(localApplications);
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Journey · lifecycle overview" title="From discovery to a completed season." lede="This view explains the canonical sequence without turning interviews, offers, or acceptance into invented application statuses." />
      <ol className={styles.journeySteps}><li><strong>1 · Discover</strong><span>Compare role, host, location, dates, housing, meals, and pay.</span></li><li><strong>2 · Apply</strong><span>Review the profile, confirm terms, and submit intentionally.</span></li><li><strong>3 · Interview</strong><span>Scheduled separately and linked to its application.</span></li><li><strong>4 · Offer and accept</strong><span>Each requires an explicit host or seeker decision.</span></li><li><strong>5 · Prepare and complete</strong><span>Travel and season records follow only after acceptance.</span></li></ol>
      <section className={styles.detailSection}><h2>Your current sample records</h2><p>{rows.length} application{rows.length === 1 ? "" : "s"} · {seekerDemoInterviews.length} scheduled interview{seekerDemoInterviews.length === 1 ? "" : "s"}</p><Link className={styles.primaryLink} href={`${DEMO_ROOT}/applications`}>Open lifecycle records</Link></section>
    </div>
  );
}

function BadgesSurface() {
  const { profile } = useDemoSeekerSession();
  const badges = [
    profile.certifications.length > 0 ? { title: "Credential stated", body: profile.certifications[0] ?? "Certification added" } : null,
    profile.workHistory.length >= 2 ? { title: "Returning seasonal worker", body: `${profile.workHistory.length} populated work-history entries` } : null,
    profileReadiness(profile) >= 90 ? { title: "Profile ready", body: `${profileReadiness(profile)}% of weighted profile fields complete` } : null,
  ].filter((badge): badge is { readonly title: string; readonly body: string } => badge !== null);
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Badges · transparent profile signals" title="Signals supported by stated sample evidence." lede="These are explanatory walkthrough indicators, not verified platform credentials, endorsements, or awards." />
      <div className={styles.statGrid}>{badges.map((badge) => <article key={badge.title} className={styles.statCard}><span>Sample indicator</span><strong className={styles.badgeMark}>✓</strong><small><b>{badge.title}</b><br />{badge.body}</small></article>)}</div>
    </div>
  );
}

function SettingsSurface() {
  const { persistenceAvailable } = useDemoSeekerSession();
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Settings · walkthrough boundary" title="A safe explanation of account controls." lede="Production settings require an authenticated account. This public route makes no identity, notification, privacy, or provider mutation." />
      <div className={styles.detailGrid}><section className={styles.detailSection}><h2>Walkthrough storage</h2><p>{persistenceAvailable ? "Choices persist only in this browser tab and clear when the tab session ends." : "Browser storage is unavailable; choices remain in memory until refresh."}</p><p>Use Reset demo in the notice above to restore every sample choice.</p></section><section className={styles.detailSection}><h2>Production controls</h2><ul><li>Account identity and sign-in</li><li>Email and notification preferences</li><li>Privacy, data export, and account deletion</li></ul><p>Those controls are intentionally unavailable here because no authenticated account exists.</p></section></div>
    </div>
  );
}

function HelpSurface() {
  return (
    <div className={styles.surface}>
      <SurfaceHeader eyebrow="Help · walkthrough guide" title="Choose the part of the seeker journey you want to inspect." lede="Every link remains inside the isolated sample account unless it is explicitly labeled as an exit." />
      <div className={styles.cardGrid}><section className={styles.detailSection}><h2>Find work</h2><p>Compare the populated discovery cards and their complete deal terms.</p><Link className={styles.primaryLink} href={`${DEMO_ROOT}/seek`}>Open Seek</Link></section><section className={styles.detailSection}><h2>Review your story</h2><p>Inspect the sample profile, résumé, work history, and readiness.</p><Link className={styles.primaryLink} href={`${DEMO_ROOT}/profile`}>Open profile</Link></section><section className={styles.detailSection}><h2>Track progress</h2><p>See applications, interviews, and role-linked conversations.</p><Link className={styles.primaryLink} href={`${DEMO_ROOT}/applications`}>Open applications</Link></section><section className={styles.detailSection}><h2>Leave the demo</h2><p>Return to the seeker overview without creating an account.</p><Link className={styles.secondaryLink} href="/for-seekers">Exit walkthrough</Link></section></div>
    </div>
  );
}

function MissingSurface({ title }: { readonly title: string }) {
  return <div className={styles.surface}><section className={styles.emptyState}><h1>{title}</h1><p>This sample record is not part of the walkthrough.</p><Link className={styles.primaryLink} href={DEMO_ROOT}>Return to sample home</Link></section></div>;
}

export function DemoSeekerExperience({
  surface,
  initialQuery = "",
  pendingApplicationListingId,
}: {
  readonly surface: SeekerDemoSurface;
  readonly initialQuery?: string;
  readonly pendingApplicationListingId?: string;
}) {
  const { resetVersion } = useDemoSeekerSession();
  const surfaces = useMemo<Record<SeekerDemoSurface, ReactNode>>(() => ({
    home: <HomeSurface />,
    seek: <SeekSurface initialQuery={initialQuery} />,
    swipe: <SwipeSurface />,
    map: <MapSurface />,
    listing: <ListingSurface />,
    apply: <ApplySurface />,
    host: <HostSurface />,
    profile: <ProfileSurface />,
    profileEdit: <ProfileEditSurface pendingApplicationListingId={pendingApplicationListingId} />,
    saved: <SavedSurface />,
    applications: <ApplicationsSurface />,
    application: <ApplicationSurface />,
    messages: <MessagesSurface />,
    thread: <ThreadSurface />,
    notifications: <NotificationsSurface />,
    schedule: <ScheduleSurface />,
    assistant: <AssistantSurface />,
    resume: <ResumeSurface />,
    invites: <InvitesSurface />,
    offers: <ApplicationSubsetSurface subset="offers" />,
    accepted: <ApplicationSubsetSurface subset="accepted" />,
    notSelected: <ApplicationSubsetSurface subset="notSelected" />,
    withdrawn: <ApplicationSubsetSurface subset="withdrawn" />,
    community: <CommunitySurface />,
    journey: <JourneySurface />,
    badges: <BadgesSurface />,
    settings: <SettingsSurface />,
    help: <HelpSurface />,
  }), [initialQuery, pendingApplicationListingId]);
  return <div key={`${surface}:${resetVersion}`} className={styles.surfaceMount}>{surfaces[surface]}</div>;
}
