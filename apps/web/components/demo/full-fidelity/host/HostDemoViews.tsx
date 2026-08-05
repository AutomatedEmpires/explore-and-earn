"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PublicHostProfileView } from "../../../host/PublicHostProfileView";
import { formatDate, formatMoney } from "../../../../lib/format";
import {
  findHostDemoApplication,
  findHostDemoThread,
  hostDemoApplications,
  hostDemoApplicationActions,
  hostDemoBenefitTriadReady,
  hostDemoDateRangeError,
  hostDemoHost,
  hostDemoHousingPhotos,
  hostDemoHourlyPaySummary,
  hostDemoInterviews,
  hostDemoInvites,
  hostDemoListingActions,
  hostDemoListingCompleteness,
  hostDemoListings,
  hostDemoLocation,
  hostDemoNow,
  hostDemoBilling,
  hostDemoNotifications,
  hostDemoPublicListingsFor,
  hostDemoPublicProfile,
  hostDemoRatingSummary,
  hostDemoSeasonLength,
  hostDemoSummary,
  hostDemoTeam,
  hostDemoThreads,
  hostDemoWeather,
  type DemoApplicationStatus,
  type HostDemoListing,
} from "./adapter";
import {
  useHostDemoSession,
  type DemoApplicantWorkspace,
  type DemoEmailCadence,
  type DemoNotificationCategory,
  type DemoProfileDraft,
} from "./HostDemoSession";
import styles from "./HostDemo.module.css";

const ROOT = "/for-hosts/demo";
const APPLICATION_STATUSES: readonly DemoApplicationStatus[] = [
  "applied",
  "reviewing",
  "saved_by_host",
  "offered",
  "accepted",
  "active",
  "completed",
  "not_selected",
  "withdrawn",
  "expired",
];

const APPLICATION_STATUS_LABEL: Readonly<Record<DemoApplicationStatus, string>> = {
  applied: "New",
  reviewing: "Reviewing",
  saved_by_host: "Saved",
  offered: "Offered",
  accepted: "Accepted",
  active: "Active",
  completed: "Completed",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

const NOTIFICATION_CATEGORIES: readonly {
  readonly id: DemoNotificationCategory;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "applications", label: "Applications", description: "New applications and candidate status changes." },
  { id: "offers_invites", label: "Offers and invitations", description: "Offer and one-to-one invitation lifecycle updates." },
  { id: "messages", label: "Messages", description: "New application-linked conversation replies." },
  { id: "scheduling", label: "Scheduling", description: "Interview confirmations, changes, and reminders." },
  { id: "matches", label: "Matches", description: "Relevant seeker and role match updates." },
  { id: "listing_lifecycle", label: "Listing lifecycle", description: "Draft, publication, pause, and archive updates." },
  { id: "account_progress", label: "Account progress", description: "Profile and workspace completion reminders." },
];

const EMAIL_CADENCES: readonly DemoEmailCadence[] = [
  "immediate",
  "daily",
  "weekly",
  "off",
];

function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lede}>{lede}</p>
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}

function Surface({ children }: { readonly children: ReactNode }) {
  return <div className={`${styles.demo} ${styles.surface}`}>{children}</div>;
}

function StatusBadge({ status, label }: { readonly status: string; readonly label?: string }) {
  return (
    <span className={styles.status} data-status={status}>
      {label ?? APPLICATION_STATUS_LABEL[status as DemoApplicationStatus] ?? status}
    </span>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly detail: string;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
      <span className={styles.statDetail}>{detail}</span>
    </div>
  );
}

function matchLabel(match: number | null): string {
  return match == null ? "Not scored" : `${match}%`;
}

function ListingCard({ listing }: { readonly listing: HostDemoListing }) {
  const completion = hostDemoListingCompleteness(listing);
  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        <Image
          className={styles.image}
          src={listing.imageUrl}
          alt={listing.imageAlt}
          fill
          sizes="(max-width: 799px) 100vw, (max-width: 1099px) 50vw, 33vw"
        />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <div>
            <h2 className={styles.cardTitle}>{listing.title}</h2>
            <p className={styles.cardSummary}>{listing.location}</p>
          </div>
          <StatusBadge status={listing.status} />
        </div>
        <p className={styles.cardSummary}>{listing.summary}</p>
        <div className={styles.facts}>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Season</span>
            <strong className={styles.factValue}>{listing.startDate}</strong>
          </span>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Pay</span>
            <strong className={styles.factValue}>{listing.pay}</strong>
          </span>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Housing</span>
            <strong className={styles.factValue}>{listing.housing}</strong>
          </span>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Meals</span>
            <strong className={styles.factValue}>{listing.meals}</strong>
          </span>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Applicants</span>
            <strong className={styles.factValue}>{listing.applications}</strong>
          </span>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Deadline</span>
            <strong className={styles.factValue}>{listing.applicationDeadline}</strong>
          </span>
          <span className={styles.fact}>
            <span className={styles.factLabel}>Readiness</span>
            <strong className={styles.factValue}>{completion.score}%</strong>
          </span>
        </div>
        <Link className={styles.buttonQuiet} href={`${ROOT}/listings/${listing.id}`}>
          Open listing
        </Link>
      </div>
    </article>
  );
}

function applicationCounts(
  statusFor: (id: string) => DemoApplicationStatus,
): Readonly<Record<DemoApplicationStatus, number>> {
  const counts: Record<DemoApplicationStatus, number> = {
    applied: 0,
    reviewing: 0,
    saved_by_host: 0,
    offered: 0,
    accepted: 0,
    active: 0,
    completed: 0,
    not_selected: 0,
    withdrawn: 0,
    expired: 0,
  };
  for (const application of hostDemoApplications) {
    counts[statusFor(application.id)] += 1;
  }
  return counts;
}

function nonEmptyLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function teamFromLines(value: string): { name: string; role: string }[] {
  return nonEmptyLines(value).map((line) => {
    const [name, ...roleParts] = line.split("|");
    return {
      name: name?.trim() || "Fictional team member",
      role: roleParts.join("|").trim() || "Team member",
    };
  });
}

function faqsFromLines(value: string): { question: string; answer: string }[] {
  return nonEmptyLines(value).flatMap((line) => {
    const [question, ...answerParts] = line.split("|");
    const answer = answerParts.join("|").trim();
    return question?.trim() && answer
      ? [{ question: question.trim(), answer }]
      : [];
  });
}

export function HostDemoDisclosure() {
  const { changeCount, reset, ready } = useHostDemoSession();
  const [resetLabel, setResetLabel] = useState("Reset demo");

  function onReset() {
    reset();
    setResetLabel("Reset complete");
    window.setTimeout(() => setResetLabel("Reset demo"), 1600);
  }

  return (
    <aside className={`${styles.demo} ${styles.disclosure}`} role="note" aria-label="Sample workspace notice">
      <span className={styles.disclosureMark} aria-hidden>
        E
      </span>
      <p className={styles.disclosureCopy}>
        <strong>Interactive sample workspace.</strong> Every person, role, message,
        and decision here is fictional. Your changes stay in this browser tab;
        nothing is sent, saved to an account, or charged.
        {ready && changeCount > 0 ? ` ${changeCount} demo change${changeCount === 1 ? "" : "s"} made.` : ""}
      </p>
      <button className={styles.resetButton} type="button" onClick={onReset}>
        {resetLabel}
      </button>
    </aside>
  );
}

export function HostDemoOverview() {
  const {
    statusFor,
    listings,
    unreadNotificationCount,
    unreadMessageCount,
    profileCompletion,
    isNotificationRead,
  } = useHostDemoSession();
  const counts = applicationCounts(statusFor);
  const published = listings.filter((listing) => listing.status === "published");
  const attention = hostDemoApplications.filter((application) => statusFor(application.id) === "applied").slice(0, 4);
  const upcomingInterviews = hostDemoInterviews.filter(
    (interview) => interview.status === "selected",
  );
  const deadlines = published.filter(
    (listing) => listing.applicationDeadline !== "No deadline",
  );

  return (
    <Surface>
      <PageHeader
        eyebrow={`${hostDemoHost.name} · Host overview`}
        title="Your season, from one clear workspace"
        lede="See what needs a decision, continue the conversations already in motion, and keep every open role honest about pay, housing, meals, and timing."
        actions={
          <Link className={styles.button} href={`${ROOT}/listings/new`}>
            Create listing
          </Link>
        }
      />

      <div className={styles.stats} aria-label="Workspace summary">
        <Stat label="Live listings" value={published.length} detail={`${listings.length - published.length} not live`} />
        <Stat label="New applicants" value={counts.applied} detail={`${counts.reviewing + counts.saved_by_host} under review`} />
        <Stat label="Upcoming interviews" value={upcomingInterviews.length} detail="Confirmed sample records" />
        <Stat label="Offers awaiting response" value={counts.offered} detail={`${counts.accepted} accepted`} />
        <Stat label="Unread messages" value={unreadMessageCount} detail={`${hostDemoThreads.length} conversations`} />
        <Stat label="Profile completion" value={`${profileCompletion.score}%`} detail={profileCompletion.missing[0] ?? "Public profile complete"} />
      </div>

      <div className={styles.gridTwo}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Needs attention</h2>
              <p className={styles.panelNote}>New applications that have not entered review yet.</p>
            </div>
            <Link className={styles.buttonQuiet} href={`${ROOT}/applicants`}>View pipeline</Link>
          </div>
          {attention.length > 0 ? (
            <ul className={styles.list}>
              {attention.map((application) => (
                <li className={styles.attentionItem} key={application.id}>
                  <span className={styles.listItemMain}>
                    <Link className={styles.listItemTitle} href={`${ROOT}/applicants/${application.id}`}>
                      {application.seekerName}
                    </Link>
                    <span className={styles.listItemMeta}>{application.listingTitle} · applied {application.appliedAt}</span>
                  </span>
                  <span className={styles.score}>{matchLabel(application.match)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Every sample application has a current decision.</p>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Next interviews</h2>
              <p className={styles.panelNote}>Interviews are scheduled records, not pipeline stages.</p>
            </div>
          </div>
          <ul className={styles.timeline}>
            {upcomingInterviews.slice(0, 4).map((interview) => (
              <li className={styles.timelineItem} key={interview.id}>
                <span className={styles.listItemMain}>
                  <strong className={styles.listItemTitle}>{interview.seekerName}</strong>
                  <span className={styles.listItemMeta}>{interview.listingTitle} · {interview.format}</span>
                </span>
                <span className={styles.badge}>{interview.startsAt}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Listing health</h2>
            <p className={styles.panelNote}>All-time application counts from this sample workspace. No invented traffic sources or trend lines.</p>
          </div>
          <Link className={styles.buttonQuiet} href={`${ROOT}/dashboard`}>Open analytics</Link>
        </div>
        <div className={styles.barList}>
          {published.map((listing) => {
            const count = hostDemoApplications.filter((application) => application.listingId === listing.id).length;
            const max = Math.max(1, ...published.map((item) => hostDemoApplications.filter((application) => application.listingId === item.id).length));
            return (
              <div className={styles.barRow} key={listing.id}>
                <Link className={styles.listItemTitle} href={`${ROOT}/listings/${listing.id}`}>{listing.title}</Link>
                <span className={styles.barTrack} aria-hidden><span className={styles.barFill} style={{ width: `${(count / max) * 100}%` }} /></span>
                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <div className={styles.gridTwo} style={{ marginTop: 16 }}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Application deadlines</h2>
              <p className={styles.panelNote}>Dates come directly from each sample listing.</p>
            </div>
            <Link className={styles.buttonQuiet} href={`${ROOT}/listings`}>Manage roles</Link>
          </div>
          <ul className={styles.list}>
            {deadlines.slice(0, 4).map((listing) => (
              <li className={styles.listItem} key={listing.id}>
                <span className={styles.listItemMain}>
                  <Link className={styles.listItemTitle} href={`${ROOT}/listings/${listing.id}`}>{listing.title}</Link>
                  <span className={styles.listItemMeta}>{listing.applicationDeadlineDetail} · {listing.applications} applicants for {listing.openPositions} openings</span>
                </span>
                <span className={styles.badge}>{listing.applicationDeadline}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Recent activity</h2>
              <p className={styles.panelNote}>{unreadNotificationCount} unread workspace notification{unreadNotificationCount === 1 ? "" : "s"}.</p>
            </div>
            <Link className={styles.buttonQuiet} href={`${ROOT}/notifications`}>All notifications</Link>
          </div>
          <ul className={styles.list}>
            {hostDemoNotifications.map((notification) => (
              <li className={styles.listItem} key={notification.id}>
                <span className={styles.listItemMain}>
                  <Link className={styles.listItemTitle} href={notification.href}>{notification.title}</Link>
                  <span className={styles.listItemMeta}>{notification.body} · {notification.createdLabel}</span>
                </span>
                {!isNotificationRead(notification.id) ? <span className={styles.status}>Unread</span> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Surface>
  );
}

export function HostDemoListings() {
  const { listings } = useHostDemoSession();
  const [filter, setFilter] = useState<"all" | HostDemoListing["status"]>("all");
  const visible = filter === "all" ? listings : listings.filter((listing) => listing.status === filter);

  return (
    <Surface>
      <PageHeader
        eyebrow="Listings"
        title="Every role says what the season really includes"
        lede="Published roles are discoverable and accept applications. Drafts stay private until the host reviews the dates, pay, housing, meals, and position details."
        actions={<Link className={styles.button} href={`${ROOT}/listings/new`}>Create listing</Link>}
      />
      <div className={styles.filterBar} role="group" aria-label="Filter listings">
        {(["all", "published", "ready", "paused", "draft", "closed", "archived"] as const).map((value) => (
          <button
            className={filter === value ? styles.button : styles.buttonQuiet}
            type="button"
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? `All (${listings.length})` : `${value.charAt(0).toUpperCase()}${value.slice(1)} (${listings.filter((listing) => listing.status === value).length})`}
          </button>
        ))}
      </div>
      {visible.length > 0 ? (
        <div className={styles.listingGrid}>{visible.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div>
      ) : (
        <div className={styles.empty}><p>No sample listings match this filter.</p></div>
      )}
    </Surface>
  );
}

export function HostDemoListingDetail({ listingId }: { readonly listingId: string }) {
  const router = useRouter();
  const { listingFor, transitionListing, duplicateListing, markListingFilled } = useHostDemoSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const listing = listingFor(listingId);
  if (!listing) return <HostDemoNotFound kind="listing" />;
  const applications = hostDemoApplications.filter((application) => application.listingId === listing.id);
  const triadReady = hostDemoBenefitTriadReady(listing);
  const hasOpenCapacity = listing.filledPositions < listing.openPositions;
  const completion = hostDemoListingCompleteness(listing);
  const lifecycleActions = hostDemoListingActions(listing.status).filter(
    (action) =>
      !(["ready", "published"] as const).includes(action.status as "ready" | "published") ||
      (triadReady && completion.score === 100 && (action.status !== "published" || hasOpenCapacity)),
  );
  const canonicalListing = hostDemoListings.find((item) => item.id === listing.id);
  const publicListingHref = canonicalListing === listing && hostDemoPublicListingsFor([listing]).length > 0
    ? `/for-seekers/demo/listing/${listing.id}`
    : null;

  function duplicate() {
    const duplicateId = duplicateListing(listingId);
    if (duplicateId) router.push(`${ROOT}/listings/${duplicateId}/edit`);
  }

  return (
    <Surface>
      <PageHeader
        eyebrow={`${listing.status} listing`}
        title={listing.title}
        lede={`${listing.location} · ${listing.startDate} to ${listing.endDate}`}
        actions={<Link className={styles.buttonQuiet} href={`${ROOT}/listings`}>Back to listings</Link>}
      />
      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <div className={styles.detailImage}>
            <Image className={styles.image} src={listing.imageUrl} alt={listing.imageAlt} fill sizes="(max-width: 799px) 100vw, 70vw" priority />
          </div>
          <section className={`${styles.panel} ${styles.copy}`}>
            <span className={styles.sampleTag}>Seeker-facing preview</span>
            <h2>About the position</h2>
            <p>{listing.description}</p>
            <h2>What makes the season work</h2>
            <ul>{listing.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
            <h2>What the host includes</h2>
            <ul>{listing.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <div className={styles.gridTwo}>
            <section className={`${styles.panel} ${styles.copy}`}>
              <h2>Responsibilities and training</h2>
              <h3>What the role owns</h3>
              <ul>{listing.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
              <h3>Training</h3>
              <ul>{listing.training.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Housing</h2>
              <div className={styles.stack} style={{ marginTop: 12 }}>
                {(listing.housingDetails.provision === "provided" ? [
                  ["Answer", listing.housingDetails.provision],
                  ["Summary", listing.housing],
                  ["Type", listing.housingDetails.type],
                  ["Cost", listing.housingDetails.cost],
                  ["Occupancy", listing.housingDetails.occupancy],
                  ["Distance", listing.housingDetails.distanceFromWork],
                  ["Availability", listing.housingDetails.availability],
                ] : [["Answer", listing.housingDetails.provision], ["Summary", listing.housing]]).map(([label, value]) => <span className={styles.fact} key={label}><span className={styles.factLabel}>{label}</span><strong className={styles.factValue}>{value || "Not stated"}</strong></span>)}
              </div>
              {listing.housingDetails.provision === "provided" ? <><h3 className={styles.cardTitle} style={{ marginTop: 18 }}>Amenities and rules</h3><p className={styles.panelNote}>{[...listing.housingDetails.amenities, ...listing.housingDetails.utilities, ...listing.housingDetails.rules].join(" · ") || "Not stated"}</p></> : null}
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Meals</h2>
              <div className={styles.stack} style={{ marginTop: 12 }}>
                {((["provided", "partial"] as const).includes(listing.mealsDetails.provision as "provided" | "partial") ? [
                  ["Answer", listing.mealsDetails.provision],
                  ["Summary", listing.meals],
                  ["Cost", listing.mealsDetails.cost],
                  ["Style", listing.mealsDetails.style],
                  ["Included", listing.mealsDetails.included.join(", ")],
                  ["Dietary support", listing.mealsDetails.dietaryAccommodations.join(", ")],
                ] : [["Answer", listing.mealsDetails.provision], ["Summary", listing.meals]]).map(([label, value]) => <span className={styles.fact} key={label}><span className={styles.factLabel}>{label}</span><strong className={styles.factValue}>{value || "Not stated"}</strong></span>)}
              </div>
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Pay and hours</h2>
              <div className={styles.stack} style={{ marginTop: 12 }}>
                <span className={styles.fact}><span className={styles.factLabel}>Rate</span><strong className={styles.factValue}>{listing.pay}</strong></span>
                <span className={styles.fact}><span className={styles.factLabel}>Hours/week</span><strong className={styles.factValue}>{listing.payDetails.estimatedHoursPerWeek || "Not stated"}</strong></span>
                <span className={styles.fact}><span className={styles.factLabel}>Additional compensation</span><strong className={styles.factValue}>{listing.payDetails.additionalCompensation.join(", ") || "None stated"}</strong></span>
              </div>
            </section>
          </div>
          <section className={styles.panel}>
            <div className={styles.panelHead}><div><h2 className={styles.panelTitle}>Listing media</h2><p className={styles.panelNote}>Every image is an explicitly labeled illustrative demo scene.</p></div><span className={styles.badge}>{listing.media.length} image{listing.media.length === 1 ? "" : "s"}</span></div>
            <div className={styles.photoGrid}>{listing.media.map((item) => <figure className={styles.photoCard} key={item.id}><div className={styles.photoImage}><Image className={styles.image} src={item.imageUrl} alt={item.imageAlt} fill sizes="(max-width: 799px) 50vw, 25vw" /></div><figcaption><strong>{item.label}</strong><span>Illustrative demo scene</span></figcaption></figure>)}</div>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}><div><h2 className={styles.panelTitle}>Application intake</h2><p className={styles.panelNote}>The live application currently collects one cover message. Custom questions below are session-only planning previews and are not collected from real seekers.</p></div><span className={styles.sampleTag}>Demo-only planning</span></div>
            {listing.applicationQuestions.length > 0 ? <ol className={styles.list}>{listing.applicationQuestions.map((question) => <li className={styles.fact} key={question}>{question}</li>)}</ol> : <p className={styles.muted}>No custom questions. Applicants submit the canonical cover message.</p>}
          </section>
        </div>
        <aside className={`${styles.sideCard} ${styles.stickySide}`}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Role snapshot</h2>
            <StatusBadge status={listing.status} />
          </div>
          <div className={styles.stack}>
            {[
              ["Begins", listing.startDate],
              ["Ends", listing.endDate],
              ["Season length", listing.seasonLength],
              ["Pay", listing.pay],
              ["Housing", listing.housing],
              ["Meals", listing.meals],
              ["Applications", String(applications.length)],
              ["Open positions", String(listing.openPositions)],
              ["Application deadline", listing.applicationDeadline],
              ["Filled", `${listing.filledPositions} of ${listing.openPositions}`],
              ["Readiness", `${completion.score}%`],
            ].map(([label, value]) => (
              <span className={styles.fact} key={label}><span className={styles.factLabel}>{label}</span><strong className={styles.factValue}>{value}</strong></span>
            ))}
          </div>
          <div className={styles.actions} style={{ marginTop: 16 }}>
            <Link className={styles.button} href={`${ROOT}/applicants`}>View applicants</Link>
            <Link className={styles.buttonQuiet} href={`${ROOT}/listings/${listing.id}/edit`}>Edit</Link>
            {publicListingHref ? <Link className={styles.buttonQuiet} href={publicListingHref}>Public preview</Link> : <span className={styles.helper}>Session-edited and browser-only roles stay in the manager preview; the canonical seeker detail remains unchanged.</span>}
            <button className={styles.buttonQuiet} type="button" onClick={duplicate}>Duplicate</button>
            {(listing.status === "published" || listing.status === "paused") && listing.filledPositions < listing.openPositions ? <button className={styles.buttonQuiet} type="button" onClick={() => { markListingFilled(listing.id); setNotice("All positions marked filled; a live role is paused in this demo."); }}>Mark positions filled</button> : null}
            {lifecycleActions.map((action) => (
              <button
                className={action.variant === "primary" ? styles.button : styles.buttonQuiet}
                type="button"
                key={action.status}
                onClick={() => {
                  if (action.status === "archived" && !lifecycleReason.trim()) {
                    setNotice("Add an archive reason so the terminal record keeps its context.");
                    return;
                  }
                  transitionListing(listing.id, action.status, lifecycleReason);
                  setLifecycleReason("");
                  setNotice(`${action.label} completed in this demo.`);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          <label className={styles.field} style={{ marginTop: 16 }}><span className={styles.fieldLabel}>Lifecycle reason</span><textarea className={styles.textarea} value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} placeholder="Required before archive; optional context for pause or reopen" /></label>
          {notice ? <p className={styles.success} role="status">{notice}</p> : null}
          <p className={styles.helper}>Close is intentionally not a host action in production. Pause hides a live role temporarily; archive is terminal; a verified role closed by Explore &amp; Earn can reopen as draft. “Mark positions filled” is a demo planning shortcut that records staffing and pauses discovery.</p>
          {!triadReady ? <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}><strong>Publication blocked</strong><br />Housing, Meals, and Pay must each have an explicit valid answer before this role can move to ready or publish.</div> : null}
          {!hasOpenCapacity ? <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}><strong>Role is fully staffed</strong><br />Increase open positions in Edit before resuming discovery.</div> : null}
          {completion.missing.length > 0 ? <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}><strong>Listing quality checklist</strong><br />Complete: {completion.missing.join(", ")}.</div> : null}
          {listing.lifecycle.length > 0 ? <div className={styles.stack} style={{ marginTop: 16 }}><h3 className={styles.cardTitle}>Lifecycle context</h3>{listing.lifecycle.map((event) => <div className={styles.fact} key={event.id}><span className={styles.factLabel}>{event.status} · {event.changedLabel}</span><strong className={styles.factValue}>{event.reason}</strong></div>)}</div> : null}
        </aside>
      </div>
    </Surface>
  );
}

export function HostDemoNewListing() {
  const router = useRouter();
  const { createDraft } = useHostDemoSession();
  const [submitted, setSubmitted] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const startDate = String(data.get("startDate") ?? "");
    const endDate = String(data.get("endDate") ?? "");
    const nextDateError = hostDemoDateRangeError(startDate, endDate);
    if (nextDateError) {
      setSubmitted(false);
      setDateError(nextDateError);
      return;
    }
    setDateError(null);
    const payMinimumCents = Math.max(0, Math.round(Number(data.get("payMinimum")) * 100));
    const payMaximumCents = Math.max(payMinimumCents, Math.round(Number(data.get("payMaximum")) * 100));
    const housingProvision = String(data.get("housingProvision") ?? "not_stated") as HostDemoListing["housingDetails"]["provision"];
    const mealsProvision = String(data.get("mealsProvision") ?? "not_stated") as HostDemoListing["mealsDetails"]["provision"];
    const housingProvided = housingProvision === "provided";
    const mealsIncludedByHost = mealsProvision === "provided" || mealsProvision === "partial";
    const id = createDraft({
      title: String(data.get("title") ?? ""),
      location: String(data.get("location") ?? ""),
      startDate,
      endDate,
      pay: hostDemoHourlyPaySummary(payMinimumCents, payMaximumCents),
      payMinimumCents,
      payMaximumCents,
      estimatedHoursPerWeek: String(data.get("estimatedHours") ?? ""),
      additionalCompensation: nonEmptyLines(String(data.get("additionalCompensation") ?? "")),
      housing: housingProvided ? String(data.get("housing") ?? "") : housingProvision === "not_provided" ? "Not provided" : "Not stated",
      housingProvision,
      housingType: housingProvided ? String(data.get("housingType") ?? "") : "",
      housingCost: housingProvided ? String(data.get("housingCost") ?? "") : "",
      housingOccupancy: housingProvided ? String(data.get("housingOccupancy") ?? "") : "",
      housingDistance: housingProvided ? String(data.get("housingDistance") ?? "") : "",
      housingAvailability: housingProvided ? String(data.get("housingAvailability") ?? "") : "",
      housingAmenities: housingProvided ? nonEmptyLines(String(data.get("housingAmenities") ?? "")) : [],
      housingUtilities: housingProvided ? nonEmptyLines(String(data.get("housingUtilities") ?? "")) : [],
      housingRules: housingProvided ? nonEmptyLines(String(data.get("housingRules") ?? "")) : [],
      meals: mealsIncludedByHost ? String(data.get("meals") ?? "") : mealsProvision === "not_provided" ? "Not provided" : "Not stated",
      mealsProvision,
      mealsStyle: mealsIncludedByHost ? String(data.get("mealsStyle") ?? "") : "",
      mealsCost: mealsIncludedByHost ? String(data.get("mealsCost") ?? "") : "",
      mealsIncluded: mealsIncludedByHost ? nonEmptyLines(String(data.get("mealsIncluded") ?? "")) : [],
      dietaryAccommodations: mealsIncludedByHost ? nonEmptyLines(String(data.get("dietaryAccommodations") ?? "")) : [],
      summary: String(data.get("summary") ?? ""),
      description: String(data.get("description") ?? ""),
      responsibilities: nonEmptyLines(String(data.get("responsibilities") ?? "")),
      requirements: nonEmptyLines(String(data.get("requirements") ?? "")),
      training: nonEmptyLines(String(data.get("training") ?? "")),
      highlights: nonEmptyLines(String(data.get("highlights") ?? "")),
      applicationQuestions: nonEmptyLines(String(data.get("applicationQuestions") ?? "")),
      applicationDeadline: String(data.get("applicationDeadline") ?? ""),
      openPositions: Number(data.get("openPositions") ?? 1),
    });
    setSubmitted(true);
    window.setTimeout(() => router.push(`${ROOT}/listings/${id}`), 500);
  }

  return (
    <Surface>
      <PageHeader eyebrow="New listing" title="Start with the facts a seeker needs" lede="This walkthrough saves a private draft to this tab only. No listing is published, no plan is changed, and no real seeker can see it." actions={<Link className={styles.buttonQuiet} href={`${ROOT}/listings`}>Cancel</Link>} />
      <form className={styles.panel} onSubmit={onSubmit}>
        <div className={styles.formGrid}>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Position title</span><input className={styles.input} name="title" required defaultValue="Front desk host" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Location</span><input className={styles.input} name="location" required defaultValue={hostDemoHost.location} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Pay minimum ($/hr)</span><input className={styles.input} name="payMinimum" type="number" min="0" step="0.25" required defaultValue="18" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Pay maximum ($/hr)</span><input className={styles.input} name="payMaximum" type="number" min="0" step="0.25" required defaultValue="20" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Estimated hours/week</span><input className={styles.input} name="estimatedHours" required defaultValue="32–40" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Begins</span><input className={styles.input} name="startDate" type="date" required defaultValue="2026-05-18" aria-invalid={Boolean(dateError)} onChange={() => setDateError(null)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Ends</span><input className={styles.input} name="endDate" type="date" required defaultValue="2026-10-04" aria-invalid={Boolean(dateError)} onChange={() => setDateError(null)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Application deadline</span><input className={styles.input} name="applicationDeadline" type="date" defaultValue="2026-08-25" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Open positions</span><input className={styles.input} name="openPositions" type="number" min="1" max="100" required defaultValue="1" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing</span><input className={styles.input} name="housing" required defaultValue={hostDemoHost.housing} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing answer</span><select className={styles.select} name="housingProvision" defaultValue="provided"><option value="provided">Provided</option><option value="not_provided">Not provided</option><option value="not_stated">Not stated</option></select></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meals</span><input className={styles.input} name="meals" required defaultValue={hostDemoHost.meals} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meals answer</span><select className={styles.select} name="mealsProvision" defaultValue="partial"><option value="provided">Provided</option><option value="partial">Partially provided</option><option value="not_provided">Not provided</option><option value="not_stated">Not stated</option></select></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Position summary</span><textarea className={styles.textarea} name="summary" required defaultValue="Welcome guests, coordinate arrivals, and keep the front desk calm and helpful throughout the season." /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>About the position</span><textarea className={styles.textarea} name="description" required defaultValue="Guide arrivals, answer guest questions, and document handoffs with the lodge team." /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Responsibilities</span><textarea className={styles.textarea} name="responsibilities" required defaultValue={"Run check-in and departure workflows\nCoordinate room status\nDocument front-desk handoffs"} /><span className={styles.helper}>One item per line.</span></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Requirements</span><textarea className={styles.textarea} name="requirements" required defaultValue={"Guest-facing work experience\nWeekend availability\nAble to lift 35 pounds"} /><span className={styles.helper}>One item per line.</span></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Training</span><textarea className={styles.textarea} name="training" required defaultValue={"Two paid orientation days\nThree shadow shifts"} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Benefits and highlights</span><textarea className={styles.textarea} name="highlights" required defaultValue={"Completion bonus\nPaddle equipment access"} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing type</span><input className={styles.input} name="housingType" required defaultValue="Shared two-person cabin room" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing cost</span><input className={styles.input} name="housingCost" required defaultValue="No charge" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing occupancy</span><input className={styles.input} name="housingOccupancy" required defaultValue="Two people per bedroom" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Distance from work</span><input className={styles.input} name="housingDistance" required defaultValue="About a 6-minute walk" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing availability</span><input className={styles.input} name="housingAvailability" required defaultValue="Full listed season" /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Housing amenities</span><textarea className={styles.textarea} name="housingAmenities" required defaultValue={"Wi-Fi\nLaundry\nShared kitchen\nHeat"} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Utilities</span><textarea className={styles.textarea} name="housingUtilities" required defaultValue={"Electricity\nWater\nHeat\nWi-Fi"} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Housing rules</span><textarea className={styles.textarea} name="housingRules" required defaultValue={"Quiet hours after 10:30 PM\nNo smoking indoors"} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meal style</span><input className={styles.input} name="mealsStyle" required defaultValue="Family-style staff meal" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meal cost</span><input className={styles.input} name="mealsCost" required defaultValue="Included on shift" /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Meals included</span><textarea className={styles.textarea} name="mealsIncluded" required defaultValue={"One hot meal per shift\nCoffee and tea\nBreakfast staples"} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Dietary accommodations</span><textarea className={styles.textarea} name="dietaryAccommodations" required defaultValue={"Vegetarian\nDairy-free with notice\nGluten-aware options"} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Additional compensation</span><textarea className={styles.textarea} name="additionalCompensation" defaultValue="$500 completion bonus after the full season" /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Custom application questions</span><textarea className={styles.textarea} name="applicationQuestions" placeholder="Optional preview-only questions, one per line" /><span className={styles.helper}>Demo-only planning: the production application currently collects one cover message and does not persist custom answers.</span></label>
        </div>
        {dateError ? <div className={styles.callout} role="alert" style={{ marginTop: 18 }}><strong>Check the season dates.</strong><br />{dateError}</div> : null}
        <div className={styles.actions} style={{ marginTop: 18 }}>
          <button className={styles.button} type="submit">Save demo draft</button>
          <span className={styles.helper}>You will preview the draft next.</span>
        </div>
        {submitted ? <p className={styles.success} role="status">Draft saved in this tab. Opening the preview…</p> : null}
      </form>
    </Surface>
  );
}

export function HostDemoListingEdit({ listingId }: { readonly listingId: string }) {
  const { listingFor } = useHostDemoSession();
  const listing = listingFor(listingId);
  if (!listing) return <HostDemoNotFound kind="listing" />;
  return <HostDemoListingEditForm key={listing.id} listing={listing} />;
}

function HostDemoListingEditForm({ listing }: { readonly listing: HostDemoListing }) {
  const { updateListing } = useHostDemoSession();
  const [draft, setDraft] = useState<HostDemoListing>(listing);
  const [saved, setSaved] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDateError = hostDemoDateRangeError(draft.startDate, draft.endDate);
    if (nextDateError) {
      setSaved(false);
      setDateError(nextDateError);
      return;
    }
    setDateError(null);
    updateListing({
      ...draft,
      seasonLength: hostDemoSeasonLength(draft.startDate, draft.endDate),
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <Surface>
      <PageHeader
        eyebrow="Edit listing"
        title={listing.title}
        lede="This mirrors the production listing editor’s core facts while keeping every edit inside this browser tab."
        actions={<Link className={styles.buttonQuiet} href={`${ROOT}/listings/${listing.id}`}>Cancel</Link>}
      />
      <form className={styles.panel} onSubmit={save}>
        <div className={styles.formGrid}>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Position title</span><input className={styles.input} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Location</span><input className={styles.input} required value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
          <div className={styles.field}><span className={styles.fieldLabel}>Pay summary</span><output className={styles.factValue}>{draft.pay}</output></div>
          <label className={styles.field}><span className={styles.fieldLabel}>Pay minimum ($/hr)</span><input className={styles.input} type="number" min="0" step="0.25" required value={draft.compensationMinCents / 100} onChange={(event) => { const minimum = Math.max(0, Math.round(Number(event.target.value) * 100)); const maximum = Math.max(minimum, draft.compensationMaxCents); setDraft({ ...draft, compensationMinCents: minimum, compensationMaxCents: maximum, pay: hostDemoHourlyPaySummary(minimum, maximum) }); }} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Pay maximum ($/hr)</span><input className={styles.input} type="number" min="0" step="0.25" required value={draft.compensationMaxCents / 100} onChange={(event) => { const maximum = Math.max(draft.compensationMinCents, Math.round(Number(event.target.value) * 100)); setDraft({ ...draft, compensationMaxCents: maximum, pay: hostDemoHourlyPaySummary(draft.compensationMinCents, maximum) }); }} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Estimated hours/week</span><input className={styles.input} required value={draft.payDetails.estimatedHoursPerWeek} onChange={(event) => setDraft({ ...draft, payDetails: { ...draft.payDetails, estimatedHoursPerWeek: event.target.value } })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Begins</span><input className={styles.input} required value={draft.startDate} aria-invalid={Boolean(dateError)} onChange={(event) => { setDateError(null); setDraft({ ...draft, startDate: event.target.value }); }} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Ends</span><input className={styles.input} required value={draft.endDate} aria-invalid={Boolean(dateError)} onChange={(event) => { setDateError(null); setDraft({ ...draft, endDate: event.target.value }); }} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Application deadline</span><input className={styles.input} value={draft.applicationDeadline === "No deadline" ? "" : draft.applicationDeadline} onChange={(event) => setDraft({ ...draft, applicationDeadline: event.target.value || "No deadline", applicationDeadlineDetail: event.target.value ? "Deadline edited in this demo" : "No application deadline set" })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Open positions</span><input className={styles.input} type="number" min="1" max="100" required value={draft.openPositions} onChange={(event) => setDraft({ ...draft, openPositions: Math.max(1, Number(event.target.value) || 1) })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing summary</span><input className={styles.input} required value={draft.housing} onChange={(event) => setDraft({ ...draft, housing: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing answer</span><select className={styles.select} value={draft.housingDetails.provision} onChange={(event) => { const provision = event.target.value as HostDemoListing["housingDetails"]["provision"]; const provided = provision === "provided"; setDraft({ ...draft, housing: provided ? (draft.housingDetails.provision === "provided" ? draft.housing : "") : provision === "not_provided" ? "Not provided" : "Not stated", housingIncluded: provided, housingDetails: provided ? { ...draft.housingDetails, provision } : { provision, type: "", cost: "", occupancy: "", distanceFromWork: "", availability: "", amenities: [], utilities: [], rules: [] } }); }}><option value="provided">Provided</option><option value="not_provided">Not provided</option><option value="not_stated">Not stated</option></select></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meals summary</span><input className={styles.input} required value={draft.meals} onChange={(event) => setDraft({ ...draft, meals: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meals answer</span><select className={styles.select} value={draft.mealsDetails.provision} onChange={(event) => { const provision = event.target.value as HostDemoListing["mealsDetails"]["provision"]; const included = provision === "provided" || provision === "partial"; setDraft({ ...draft, meals: included ? ((draft.mealsDetails.provision === "provided" || draft.mealsDetails.provision === "partial") ? draft.meals : "") : provision === "not_provided" ? "Not provided" : "Not stated", mealsIncluded: included, mealsDetails: included ? { ...draft.mealsDetails, provision } : { provision, cost: "", style: "", included: [], dietaryAccommodations: [] } }); }}><option value="provided">Provided</option><option value="partial">Partially provided</option><option value="not_provided">Not provided</option><option value="not_stated">Not stated</option></select></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Short summary</span><textarea className={styles.textarea} required value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>About the position</span><textarea className={styles.textarea} required value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Responsibilities</span><textarea className={styles.textarea} value={draft.responsibilities.join("\n")} onChange={(event) => setDraft({ ...draft, responsibilities: nonEmptyLines(event.target.value) })} /><span className={styles.helper}>One responsibility per line.</span></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Requirements</span><textarea className={styles.textarea} value={draft.requirements.join("\n")} onChange={(event) => setDraft({ ...draft, requirements: nonEmptyLines(event.target.value) })} /><span className={styles.helper}>One requirement per line.</span></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Training</span><textarea className={styles.textarea} value={draft.training.join("\n")} onChange={(event) => setDraft({ ...draft, training: nonEmptyLines(event.target.value) })} /><span className={styles.helper}>One item per line.</span></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Benefits and highlights</span><textarea className={styles.textarea} value={draft.highlights.join("\n")} onChange={(event) => setDraft({ ...draft, highlights: nonEmptyLines(event.target.value) })} /><span className={styles.helper}>One item per line.</span></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing type</span><input className={styles.input} value={draft.housingDetails.type} onChange={(event) => setDraft({ ...draft, housingDetails: { ...draft.housingDetails, type: event.target.value } })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing cost</span><input className={styles.input} value={draft.housingDetails.cost} onChange={(event) => setDraft({ ...draft, housingDetails: { ...draft.housingDetails, cost: event.target.value } })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing occupancy</span><input className={styles.input} value={draft.housingDetails.occupancy} onChange={(event) => setDraft({ ...draft, housingDetails: { ...draft.housingDetails, occupancy: event.target.value } })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Distance from work</span><input className={styles.input} value={draft.housingDetails.distanceFromWork} onChange={(event) => setDraft({ ...draft, housingDetails: { ...draft.housingDetails, distanceFromWork: event.target.value } })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing availability</span><input className={styles.input} value={draft.housingDetails.availability} onChange={(event) => setDraft({ ...draft, housingDetails: { ...draft.housingDetails, availability: event.target.value } })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Housing amenities</span><textarea className={styles.textarea} value={draft.housingDetails.amenities.join("\n")} onChange={(event) => setDraft({ ...draft, housingDetails: { ...draft.housingDetails, amenities: nonEmptyLines(event.target.value) } })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Housing utilities</span><textarea className={styles.textarea} value={draft.housingDetails.utilities.join("\n")} onChange={(event) => setDraft({ ...draft, housingDetails: { ...draft.housingDetails, utilities: nonEmptyLines(event.target.value) } })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Housing rules</span><textarea className={styles.textarea} value={draft.housingDetails.rules.join("\n")} onChange={(event) => setDraft({ ...draft, housingDetails: { ...draft.housingDetails, rules: nonEmptyLines(event.target.value) } })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meal style</span><input className={styles.input} value={draft.mealsDetails.style} onChange={(event) => setDraft({ ...draft, mealsDetails: { ...draft.mealsDetails, style: event.target.value } })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meal cost</span><input className={styles.input} value={draft.mealsDetails.cost} onChange={(event) => setDraft({ ...draft, mealsDetails: { ...draft.mealsDetails, cost: event.target.value } })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Meals included</span><textarea className={styles.textarea} value={draft.mealsDetails.included.join("\n")} onChange={(event) => setDraft({ ...draft, mealsDetails: { ...draft.mealsDetails, included: nonEmptyLines(event.target.value) } })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Dietary accommodations</span><textarea className={styles.textarea} value={draft.mealsDetails.dietaryAccommodations.join("\n")} onChange={(event) => setDraft({ ...draft, mealsDetails: { ...draft.mealsDetails, dietaryAccommodations: nonEmptyLines(event.target.value) } })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Additional compensation</span><textarea className={styles.textarea} value={draft.payDetails.additionalCompensation.join("\n")} onChange={(event) => setDraft({ ...draft, payDetails: { ...draft.payDetails, additionalCompensation: nonEmptyLines(event.target.value) } })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Custom application questions</span><textarea className={styles.textarea} value={draft.applicationQuestions.join("\n")} onChange={(event) => setDraft({ ...draft, applicationQuestions: nonEmptyLines(event.target.value) })} /><span className={styles.helper}>Demo-only planning. The production application does not persist custom answers.</span></label>
        </div>
        <div className={styles.callout} style={{ marginTop: 18 }}><strong>Media library</strong><br />{draft.media.length} illustrative demo image{draft.media.length === 1 ? "" : "s"} attached. Upload and moderation are intentionally unavailable in this public walkthrough.</div>
        {dateError ? <div className={styles.callout} role="alert" style={{ marginTop: 18 }}><strong>Check the season dates.</strong><br />{dateError}</div> : null}
        <div className={styles.actions} style={{ marginTop: 18 }}>
          <button className={styles.button} type="submit">Save demo listing</button>
          <Link className={styles.buttonQuiet} href={`${ROOT}/listings/${listing.id}`}>Preview</Link>
          <span className={styles.helper}>No real listing is changed.</span>
        </div>
        {saved ? <p className={styles.success} role="status">Listing updated in this tab.</p> : null}
      </form>
    </Surface>
  );
}

export function HostDemoApplicants() {
  const { statusFor } = useHostDemoSession();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | DemoApplicationStatus>("all");
  const counts = applicationCounts(statusFor);
  const visible = hostDemoApplications.filter((application) => {
    const matchesStage = stage === "all" || statusFor(application.id) === stage;
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || application.seekerName.toLowerCase().includes(needle) || application.listingTitle.toLowerCase().includes(needle);
    return matchesStage && matchesQuery;
  });

  return (
    <Surface>
      <PageHeader eyebrow="Applicants" title="A decision pipeline with one source of truth" lede="Every canonical application status stays distinct: accepted, active, completed, not selected, withdrawn, and expired are never collapsed into one bucket. Interviews remain separate scheduled records." />
      <div className={styles.pipeline} aria-label="Application stage totals">
        {APPLICATION_STATUSES.map((status) => <button className={styles.pipelineStage} type="button" key={status} onClick={() => setStage(status)} aria-pressed={stage === status}><span>{APPLICATION_STATUS_LABEL[status]}</span><strong>{counts[status]}</strong></button>)}
      </div>
      <div className={styles.filterBar} style={{ marginTop: 16 }}>
        <label className={styles.search}><span className={styles.srOnly}>Search applicants</span><input className={styles.input} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search seeker or listing" /></label>
        <label className={styles.selectWrap}><span className={styles.srOnly}>Filter by stage</span><select className={styles.select} value={stage} onChange={(event) => setStage(event.target.value as "all" | DemoApplicationStatus)}><option value="all">All stages</option>{APPLICATION_STATUSES.map((status) => <option value={status} key={status}>{APPLICATION_STATUS_LABEL[status]}</option>)}</select></label>
      </div>
      <div className={styles.panel}>
        <ul className={styles.list}>
          {visible.map((application) => (
            <li className={styles.listItem} key={application.id}>
              <span className={styles.listItemMain}>
                <Link className={styles.listItemTitle} href={`${ROOT}/applicants/${application.id}`}>{application.seekerName}</Link>
                <span className={styles.listItemMeta}>{application.listingTitle} · {application.availability} · applied {application.appliedAt}</span>
              </span>
              <div className={styles.inlineActions}><span className={styles.score}>{matchLabel(application.match)}</span><StatusBadge status={statusFor(application.id)} /><Link className={styles.buttonQuiet} href={`${ROOT}/applicants/${application.id}`}>Review</Link></div>
            </li>
          ))}
        </ul>
        {visible.length === 0 ? <p className={styles.muted} role="status">No application matches those filters.</p> : null}
      </div>
    </Surface>
  );
}

export function HostDemoApplicantDetail({ applicationId }: { readonly applicationId: string }) {
  const application = findHostDemoApplication(applicationId);
  const {
    statusFor,
    transitionApplication,
    applicationStatusReasonFor,
    applicantWorkspaceFor,
    saveApplicantWorkspace,
  } = useHostDemoSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [comment, setComment] = useState("");
  const [workspace, setWorkspace] = useState<DemoApplicantWorkspace>(() =>
    applicantWorkspaceFor(applicationId),
  );
  if (!application) return <HostDemoNotFound kind="application" />;
  const thread = hostDemoThreads.find((item) => item.applicationId === application.id);
  const status = statusFor(application.id);
  const actions = hostDemoApplicationActions(status);
  const terminalReason = applicationStatusReasonFor(application.id);
  const assignee = hostDemoTeam.find((member) => member.id === workspace.assigneeId);

  function saveWorkspace() {
    saveApplicantWorkspace(applicationId, workspace);
    setNotice("Session-only applicant planning state saved in this tab.");
  }

  function addComment() {
    const body = comment.trim();
    if (!body) return;
    setWorkspace((current) => ({
      ...current,
      teamComments: [
        ...current.teamComments,
        {
          id: `demo_team_comment_${Date.now()}`,
          author: hostDemoTeam[0]?.name ?? "Demo host",
          body,
          createdLabel: "Just now in this demo",
        },
      ],
    }));
    setComment("");
  }

  return (
    <Surface>
      <PageHeader eyebrow="Applicant review" title={application.seekerName} lede={`${application.listingTitle} · ${application.match == null ? "Not scored" : `${application.match}% match`} · applied ${application.appliedAt}`} actions={<Link className={styles.buttonQuiet} href={`${ROOT}/applicants`}>Back to pipeline</Link>} />
      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHead}><div><h2 className={styles.panelTitle}>Application</h2><p className={styles.panelNote}>{application.bio}</p></div><span className={styles.score}>{matchLabel(application.match)}</span></div>
            <div className={styles.gridThree}>
              <span className={styles.fact}><span className={styles.factLabel}>Based</span><strong className={styles.factValue}>{application.homeBase}</strong></span>
              <span className={styles.fact}><span className={styles.factLabel}>Availability</span><strong className={styles.factValue}>{application.availability}</strong></span>
              <span className={styles.fact}><span className={styles.factLabel}>Housing</span><strong className={styles.factValue}>{application.housingNeed}</strong></span>
              <span className={styles.fact}><span className={styles.factLabel}>Meals</span><strong className={styles.factValue}>{application.mealsNeed}</strong></span>
            </div>
            <h3 className={styles.cardTitle} style={{ marginTop: 20 }}>Skills and strengths</h3>
            <div className={styles.inlineActions} style={{ marginTop: 10 }}>{application.skills.map((skill) => <span className={styles.badge} key={skill}>{skill}</span>)}</div>
          </section>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Application message</h2>
            <p className={styles.panelNote}>{application.coverNote}</p>
            <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}>
              <strong>No custom application answers exist.</strong> The production application currently stores this one cover message; the listing’s optional question planner is not connected to a real submission path.
            </div>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}><div><h2 className={styles.panelTitle}>Structured resume</h2><p className={styles.panelNote}>Current product truth: experience and certifications are structured profile rows. There is no uploaded resume document or download link.</p></div><span className={styles.sampleTag}>No file upload</span></div>
            {application.workHistory.length > 0 ? <div className={styles.stack}>{application.workHistory.map((item) => <article className={styles.fact} key={item.id}><span className={styles.factLabel}>{item.dates} · {item.location}</span><strong className={styles.factValue}>{item.role} · {item.organization}</strong><span className={styles.panelNote}>{item.highlights.join(" · ")}</span></article>)}</div> : <p className={styles.muted}>This fictional candidate has no structured work-history rows in the shared scenario.</p>}
            <h3 className={styles.cardTitle} style={{ marginTop: 20 }}>Certifications</h3>
            {application.certifications.length > 0 ? <div className={styles.inlineActions} style={{ marginTop: 10 }}>{application.certifications.map((certification) => <span className={styles.badge} key={certification}>{certification}</span>)}</div> : <p className={styles.muted}>No certification rows recorded in the sample.</p>}
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}><div><h2 className={styles.panelTitle}>Candidate planning workspace</h2><p className={styles.panelNote}>Private notes, ownership, follow-up, offer drafting, and team comments below are explicit session-only planning aids. The production applicant detail does not persist these collaboration fields today.</p></div><span className={styles.sampleTag}>Demo-only planning</span></div>
            <div className={styles.formGrid}>
              <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Private planning note</span><textarea className={styles.textarea} value={workspace.privateNote} onChange={(event) => setWorkspace({ ...workspace, privateNote: event.target.value })} /><span className={styles.helper}>Browser session only; this is not a live private-note capability.</span></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Assigned teammate</span><select className={styles.select} value={workspace.assigneeId} onChange={(event) => setWorkspace({ ...workspace, assigneeId: event.target.value })}>{hostDemoTeam.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.title}</option>)}</select></label>
              <div className={styles.field}><span className={styles.fieldLabel}>Current owner</span><strong className={styles.factValue}>{assignee?.name ?? "Unassigned"}</strong></div>
              <label className={styles.field}><span className={styles.fieldLabel}>Interview date and time</span><input className={styles.input} value={workspace.scheduledFor} onChange={(event) => setWorkspace({ ...workspace, scheduledFor: event.target.value })} placeholder="Aug 12, 2026 at 10:00 AM" /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Interview format</span><input className={styles.input} value={workspace.interviewFormat} onChange={(event) => setWorkspace({ ...workspace, interviewFormat: event.target.value })} /></label>
              <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Interview agenda</span><textarea className={styles.textarea} value={workspace.interviewAgenda} onChange={(event) => setWorkspace({ ...workspace, interviewAgenda: event.target.value })} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Follow-up due</span><input className={styles.input} type="date" value={workspace.followUpDue} onChange={(event) => setWorkspace({ ...workspace, followUpDue: event.target.value })} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Follow-up state</span><select className={styles.select} value={workspace.followUpComplete ? "complete" : "open"} onChange={(event) => setWorkspace({ ...workspace, followUpComplete: event.target.value === "complete" })}><option value="open">Open</option><option value="complete">Complete</option></select></label>
              <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Follow-up note</span><textarea className={styles.textarea} value={workspace.followUpNote} onChange={(event) => setWorkspace({ ...workspace, followUpNote: event.target.value })} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Offer pay</span><input className={styles.input} value={workspace.offerPay} onChange={(event) => setWorkspace({ ...workspace, offerPay: event.target.value, offerSaved: false })} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Offer start date</span><input className={styles.input} value={workspace.offerStartDate} onChange={(event) => setWorkspace({ ...workspace, offerStartDate: event.target.value, offerSaved: false })} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Response requested by</span><input className={styles.input} type="date" value={workspace.offerResponseBy} onChange={(event) => setWorkspace({ ...workspace, offerResponseBy: event.target.value, offerSaved: false })} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Offer draft</span><select className={styles.select} value={workspace.offerSaved ? "saved" : "editing"} onChange={(event) => setWorkspace({ ...workspace, offerSaved: event.target.value === "saved" })}><option value="editing">Editing</option><option value="saved">Saved in demo</option></select></label>
            </div>
            <div className={styles.callout} style={{ marginTop: 18 }}><strong>Assignment completeness</strong><br />Owner: {assignee?.name ?? "unassigned"} · Interview: {workspace.scheduledFor || "not scheduled"} · Follow-up: {workspace.followUpDue || "not set"} · Offer: {workspace.offerSaved ? "draft saved" : "not saved"}.</div>
            <div className={styles.actions} style={{ marginTop: 18 }}><button className={styles.button} type="button" onClick={saveWorkspace}>Save session planning</button></div>
            <div className={styles.stack} style={{ marginTop: 20 }}><h3 className={styles.cardTitle}>Team comments</h3>{workspace.teamComments.map((item) => <div className={styles.fact} key={item.id}><span className={styles.factLabel}>{item.author} · {item.createdLabel}</span><strong className={styles.factValue}>{item.body}</strong></div>)}<label className={styles.field}><span className={styles.fieldLabel}>Add session-only comment</span><textarea className={styles.textarea} value={comment} onChange={(event) => setComment(event.target.value)} /></label><button className={styles.buttonQuiet} type="button" onClick={addComment}>Add comment</button></div>
          </section>
        </div>
        <aside className={`${styles.sideCard} ${styles.stickySide}`}>
          <h2 className={styles.panelTitle}>Decision</h2>
          <div className={styles.actions} style={{ marginTop: 12 }} aria-label="Legal application actions">
            {actions.map((action) => (
              <button
                className={action.variant === "primary" ? styles.button : styles.buttonQuiet}
                type="button"
                key={action.status}
                onClick={() => {
                  if (action.status === "not_selected" && !decisionReason.trim()) {
                    setNotice("Add a not-selected reason before closing this candidacy.");
                    return;
                  }
                  transitionApplication(application.id, action.status, decisionReason);
                  setDecisionReason("");
                  setNotice(`${action.label} completed in this demo.`);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          <label className={styles.field} style={{ marginTop: 14 }}><span className={styles.fieldLabel}>Decision reason</span><textarea className={styles.textarea} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Required for Not selected" /></label>
          {actions.length === 0 ? <p className={styles.helper}>No host transition is available from <strong>{APPLICATION_STATUS_LABEL[status]}</strong>. Withdrawn and expired remain distinct terminal reasons; accepted, active, and completed retain their exact engagement state.</p> : <p className={styles.helper}>Only canonical host transitions allowed from <strong>{APPLICATION_STATUS_LABEL[status]}</strong> are shown.</p>}
          {terminalReason ? <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}><strong>{APPLICATION_STATUS_LABEL[status]} reason</strong><br />{terminalReason}</div> : null}
          {notice ? <p className={styles.success} role="status">{notice}</p> : null}
          {workspace.scheduledFor ? <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}><strong>Interview scheduled</strong><br />{workspace.scheduledFor}<br />{workspace.interviewFormat}</div> : <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}><strong>No interview scheduled.</strong> Add a session-only planning record above; authenticated scheduling remains a separate production workflow.</div>}
          <div className={styles.actions} style={{ marginTop: 16 }}>{thread ? <Link className={styles.button} href={`${ROOT}/messages/${thread.id}`}>Open conversation</Link> : null}<Link className={styles.buttonQuiet} href={`${ROOT}/listings/${application.listingId}`}>View role</Link></div>
        </aside>
      </div>
    </Surface>
  );
}

export function HostDemoMessages({ threadId }: { readonly threadId?: string }) {
  const active = threadId ? findHostDemoThread(threadId) : undefined;
  const { replies, sendReply, isThreadUnread, markThreadRead } = useHostDemoSession();
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const visible = hostDemoThreads.filter((thread) => thread.seekerName.toLowerCase().includes(query.toLowerCase()) || thread.listingTitle.toLowerCase().includes(query.toLowerCase()));
  const activeApplication = active ? hostDemoApplications.find((application) => application.id === active.applicationId) : undefined;
  const messages = active ? [...active.messages, ...(replies[active.id] ?? [])] : [];

  useEffect(() => {
    if (active) markThreadRead(active.id);
  }, [active, markThreadRead]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !body.trim()) return;
    sendReply(active.id, body);
    setBody("");
  }

  return (
    <Surface>
      <PageHeader eyebrow="Messages" title="Conversations stay attached to the application" lede="Search by seeker or role, read the complete thread, and reply without losing the candidate context. Demo replies remain in this tab and are never sent." />
      <div className={styles.workspace} data-active={active ? "true" : "false"}>
        <section className={styles.threadPane} aria-label="Conversations">
          <label><span className={styles.srOnly}>Search conversations</span><input className={styles.input} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label>
          <div className={styles.stack} style={{ marginTop: 10 }}>{visible.map((thread) => <Link className={styles.thread} data-active={thread.id === active?.id} href={`${ROOT}/messages/${thread.id}`} key={thread.id}><span className={styles.threadName}><span>{isThreadUnread(thread.id) ? <><span className={styles.unreadDot} aria-hidden /><span className={styles.srOnly}>Unread conversation: </span></> : null}{thread.seekerName}</span><small>{thread.updatedLabel}</small></span><span className={styles.listItemMeta}>{thread.listingTitle}</span><span className={styles.cardSummary}>{thread.messages.at(-1)?.body}</span></Link>)}</div>
        </section>
        <section className={styles.conversationPane} aria-label="Conversation">
          {active ? <><header className={styles.conversationHead}><Link className={styles.threadBack} href={`${ROOT}/messages`}>← Threads</Link><h2 className={styles.panelTitle}>{active.seekerName}</h2><p className={styles.panelNote}>{active.listingTitle}</p></header><div className={styles.messageList}>{messages.map((message) => <div className={styles.message} data-sender={message.sender} key={message.id}><p className={styles.messageBody}>{message.body}</p><span className={styles.messageTime}>{message.sender === "host" ? "You" : active.seekerName} · {message.sentAt}</span></div>)}</div><form className={styles.composer} onSubmit={onSubmit}><label className={styles.srOnly} htmlFor="demo-reply">Reply</label><input id="demo-reply" className={styles.input} value={body} onChange={(event) => setBody(event.target.value)} placeholder={`Message ${active.seekerName}`} /><button className={styles.button} type="submit">Send in demo</button></form></> : <div className={styles.empty}><div><h2 className={styles.panelTitle}>Choose a conversation</h2><p className={styles.panelNote}>The selected thread opens here. On a phone, it becomes the focused reading view.</p></div></div>}
        </section>
        <aside className={styles.contextPane} aria-label="Application context">
          <h2 className={styles.panelTitle}>Context</h2>
          {activeApplication ? <div className={styles.stack} style={{ marginTop: 12 }}><span className={styles.fact}><span className={styles.factLabel}>Match</span><strong className={styles.factValue}>{activeApplication.match}%</strong></span><span className={styles.fact}><span className={styles.factLabel}>Availability</span><strong className={styles.factValue}>{activeApplication.availability}</strong></span><span className={styles.fact}><span className={styles.factLabel}>Housing</span><strong className={styles.factValue}>{activeApplication.housingNeed}</strong></span><Link className={styles.buttonQuiet} href={`${ROOT}/applicants/${activeApplication.id}`}>Review application</Link></div> : <p className={styles.panelNote}>Select a thread to see the linked application.</p>}
        </aside>
      </div>
    </Surface>
  );
}

export function HostDemoAnalytics() {
  const { statusFor, listings, profileCompletion } = useHostDemoSession();
  const counts = applicationCounts(statusFor);
  const total = hostDemoApplications.length;
  const activeReview = counts.reviewing + counts.saved_by_host;
  const maxCount = Math.max(1, ...listings.map((listing) => listing.applications));

  return (
    <Surface>
      <PageHeader eyebrow="Analytics" title="All-time totals you can trace back to a person and role" lede="The current product records aggregate pipeline and per-listing performance. This walkthrough intentionally omits unsupported trends, traffic-source attribution, and forecasts." />
      <div className={styles.callout}><strong>Scope: all time through {hostDemoNow}.</strong> Date-bucketed trends are not available yet, so this view does not pretend they are.</div>
      <div className={styles.stats}><Stat label="Applications" value={total} detail="Across sample listings" /><Stat label="In review" value={activeReview} detail="Reviewing and saved" /><Stat label="Offers awaiting response" value={counts.offered} detail="Current offered stage" /><Stat label="Upcoming interviews" value={hostDemoSummary.upcomingInterviews} detail="Selected future records" /><Stat label="Accepted" value={counts.accepted} detail="Current accepted stage" /><Stat label="Profile completion" value={`${profileCompletion.score}%`} detail="Session-derived checklist" /></div>
      <div className={styles.gridTwo}>
        <section className={styles.panel}><div className={styles.panelHead}><div><h2 className={styles.panelTitle}>Pipeline</h2><p className={styles.panelNote}>Current stage count, derived from the applications.</p></div></div><div className={styles.barList}>{APPLICATION_STATUSES.map((status) => <div className={styles.barRow} key={status}><span className={styles.listItemTitle}>{status}</span><span className={styles.barTrack} aria-hidden><span className={styles.barFill} style={{ width: `${total ? (counts[status] / total) * 100 : 0}%` }} /></span><strong>{counts[status]}</strong></div>)}</div></section>
        <section className={styles.panel}><div className={styles.panelHead}><div><h2 className={styles.panelTitle}>By listing</h2><p className={styles.panelNote}>Application volume, not an invented performance score.</p></div></div><div className={styles.barList}>{listings.map((listing) => <div className={styles.barRow} key={listing.id}><Link className={styles.listItemTitle} href={`${ROOT}/listings/${listing.id}`}>{listing.title}</Link><span className={styles.barTrack} aria-hidden><span className={styles.barFill} style={{ width: `${(listing.applications / maxCount) * 100}%` }} /></span><strong>{listing.applications}</strong></div>)}</div></section>
      </div>
    </Surface>
  );
}

export function HostDemoOutreach() {
  const grouped = hostDemoListings
    .map((listing) => ({
      listing,
      invitations: hostDemoInvites.filter((invite) => invite.listingId === listing.id),
    }))
    .filter((group) => group.invitations.length > 0);

  return (
    <Surface>
      <PageHeader eyebrow="Outreach" title="Individual invitations, organized by role" lede="The product sends one role invitation to one seeker at a time. There are no campaigns, automated sequences, or invented response analytics in this walkthrough." />
      <div className={styles.callout}><strong>Lifecycle truth:</strong> delivery, view, and application states advance from real recipient and delivery events. A host cannot manually mark an invitation viewed or applied, so this walkthrough shows those states without fabricated controls.</div>
      <div className={styles.stack}>
        {grouped.map(({ listing, invitations }) => (
          <section className={styles.panel} key={listing.id}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{listing.title}</h2>
                <p className={styles.panelNote}>
                  {invitations.length} individual sample invitation{invitations.length === 1 ? "" : "s"}
                </p>
              </div>
              <Link className={styles.buttonQuiet} href={`${ROOT}/listings/${listing.id}`}>View role</Link>
            </div>
            <ul className={styles.list}>
              {invitations.map((invite) => {
                return (
                  <li className={styles.inviteItem} key={invite.id}>
                    <span className={styles.listItemMain}>
                      <strong className={styles.listItemTitle}>{invite.seekerName}</strong>
                      <span className={styles.listItemMeta}>Sent {invite.sentAt} · expires {invite.expiresAt}</span>
                    </span>
                    <div className={styles.inlineActions}>
                      <StatusBadge status={invite.status} label={invite.status === "applied" ? "Applied" : invite.status === "viewed" ? "Viewed" : "Delivered"} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Surface>
  );
}

export function HostDemoNotifications() {
  const {
    unreadNotificationCount,
    isNotificationRead,
    markNotificationRead,
    markAllNotificationsRead,
  } = useHostDemoSession();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const visible = hostDemoNotifications.filter(
    (notification) => filter === "all" || !isNotificationRead(notification.id),
  );

  return (
    <Surface>
      <PageHeader
        eyebrow="Notifications"
        title="The activity that needs your attention"
        lede="Applications, messages, and interview events stay linked to the exact workspace record that produced them."
        actions={
          <button
            className={styles.buttonQuiet}
            type="button"
            onClick={markAllNotificationsRead}
            disabled={unreadNotificationCount === 0}
          >
            Mark all read
          </button>
        }
      />
      <div className={styles.filterBar} role="group" aria-label="Filter notifications">
        {(["all", "unread"] as const).map((value) => (
          <button
            className={filter === value ? styles.button : styles.buttonQuiet}
            type="button"
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? `All (${hostDemoNotifications.length})` : `Unread (${unreadNotificationCount})`}
          </button>
        ))}
      </div>
      <section className={styles.panel} aria-label="Workspace notifications">
        {visible.length > 0 ? (
          <ul className={styles.list}>
            {visible.map((notification) => {
              const read = isNotificationRead(notification.id);
              return (
                <li className={styles.notificationItem} data-read={read} key={notification.id}>
                  <span className={styles.notificationMarker} aria-hidden>{notification.kind === "message" ? "M" : notification.kind === "interview" ? "I" : "A"}</span>
                  <span className={styles.listItemMain}>
                    <span className={styles.listItemTitle}>{notification.title}</span>
                    <span className={styles.cardSummary}>{notification.body}</span>
                    <span className={styles.listItemMeta}>{notification.createdLabel} ago · {notification.kind.replace("_", " ")}</span>
                  </span>
                  <div className={styles.inlineActions}>
                    {!read ? <span className={styles.status}><span className={styles.srOnly}>Status: </span>Unread</span> : null}
                    {!read ? <button className={styles.buttonQuiet} type="button" onClick={() => markNotificationRead(notification.id)}>Mark read</button> : null}
                    <Link className={styles.buttonQuiet} href={notification.href} onClick={() => markNotificationRead(notification.id)}>Open</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.empty}>
            <div><h2 className={styles.panelTitle}>You are caught up</h2><p className={styles.panelNote}>No unread sample notifications remain. Reset the demo to restore them.</p></div>
          </div>
        )}
      </section>
    </Surface>
  );
}

export function HostDemoAnnouncements() {
  const { announcements, addAnnouncement } = useHostDemoSession();
  const [body, setBody] = useState("We still have room for one more guest experience guide this summer. Housing and shift meals are included.");
  const [added, setAdded] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    addAnnouncement(body);
    setBody("");
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <Surface>
      <PageHeader eyebrow="Announcements" title="Say what changed, then keep an honest history" lede="Compose and preview an announcement, then add it to this sample history. Scheduling, delivery counts, opens, clicks, and engagement are not represented because the current product does not record them." />
      <div className={styles.gridTwo}>
        <form className={styles.panel} onSubmit={onSubmit}><h2 className={styles.panelTitle}>Compose a demo announcement</h2><p className={styles.panelNote}>Nothing is delivered from this public walkthrough.</p><label className={styles.field} style={{ marginTop: 14 }}><span className={styles.fieldLabel}>Announcement</span><textarea className={styles.textarea} value={body} maxLength={420} required onChange={(event) => setBody(event.target.value)} /></label><div className={styles.actions} style={{ marginTop: 10 }}><button className={styles.button} type="submit">Add to demo history</button><span className={styles.helper}>{body.length}/420</span></div>{added ? <p className={styles.success} role="status">Added in this tab.</p> : null}</form>
        <section className={styles.panel}><h2 className={styles.panelTitle}>Preview</h2><div className={styles.callout} style={{ marginTop: 14, marginBottom: 0 }}><span className={styles.sampleTag}>Sample announcement</span><p>{body || "Your announcement preview will appear here."}</p><strong>{hostDemoHost.name}</strong></div></section>
      </div>
      <section className={styles.panel} style={{ marginTop: 16 }}><div className={styles.panelHead}><div><h2 className={styles.panelTitle}>Announcement history</h2><p className={styles.panelNote}>Content and creation date only — no unsupported delivery or engagement metrics.</p></div></div><ul className={styles.list}>{announcements.map((announcement) => <li className={styles.announcementItem} key={announcement.id}><span className={styles.listItemMain}><strong className={styles.listItemTitle}>{announcement.body}</strong><span className={styles.listItemMeta}>{announcement.createdLabel}</span></span><span className={styles.sampleTag}>Sample</span></li>)}</ul></section>
    </Surface>
  );
}

export function HostDemoProfile() {
  return <HostDemoPublicProfile ownerControls />;
}

function HostDemoPublicProfile({ ownerControls = false }: { readonly ownerControls?: boolean }) {
  const { profile, listings } = useHostDemoSession();
  const publicListings = ownerControls
    ? hostDemoPublicListingsFor(listings)
    : hostDemoPublicListingsFor(hostDemoListings);
  const omittedSessionListings = listings.filter((listing) => listing.status === "published").length - publicListings.length;
  return (
    <div className={styles.demo}>
      {ownerControls ? <div className={styles.profileEditBar}>
        <span>
          <strong>Canonical seeker-facing profile</strong>
          <small>Fictional sample data · no reviews are invented</small>
        </span>
        <Link className={styles.button} href={`${ROOT}/profile/edit`}>
          Edit sample profile
        </Link>
      </div> : null}
      {!ownerControls ? <div className={styles.callout} role="note"><strong>Public preview boundary</strong><br />Listing cards stay synchronized with the canonical seeker detail walkthrough. Session-only listing edits remain visible in the host manager preview, and browser-only listings are never turned into broken public links.</div> : null}
      {ownerControls && omittedSessionListings > 0 ? <div className={styles.callout} role="note"><strong>Manager preview boundary</strong><br />{omittedSessionListings} session-created or duplicated live listing{omittedSessionListings === 1 ? " is" : "s are"} omitted because the canonical seeker demo has no durable detail route for a browser-only ID.</div> : null}
      <PublicHostProfileView
        host={{
          ...hostDemoPublicProfile,
          photoUrl: null,
          tagline: profile.tagline,
          about: profile.description,
          whyWorkForUs: profile.whyWorkForUs,
          team: teamFromLines(profile.team),
          activities: nonEmptyLines(profile.activities),
          perks: nonEmptyLines(profile.perks),
          culture: nonEmptyLines(profile.culture),
          managementApproach: profile.managementApproach || undefined,
          seasonRhythm: nonEmptyLines(profile.seasonRhythm),
          training: nonEmptyLines(profile.training),
          transportation: nonEmptyLines(profile.transportation),
          remoteness: profile.remoteness || undefined,
          nearbyServices: nonEmptyLines(profile.nearbyServices),
          housingDescription: profile.housing || undefined,
          mealsDescription: profile.meals || undefined,
          faqs: faqsFromLines(profile.faqs),
          housingOfferedGenerally: publicListings.some((listing) => listing.housingIncluded),
          mealsOfferedGenerally: publicListings.some((listing) => listing.mealsIncluded),
        }}
        listings={publicListings}
        ratingSummary={hostDemoRatingSummary}
        reviews={[]}
        coverPhotoUrl={hostDemoHost.imageUrl}
        browseHref={ownerControls ? `${ROOT}/listings` : "/for-seekers/demo/seek"}
        listingHrefPrefix={ownerControls ? `${ROOT}/listings` : "/for-seekers/demo/listing"}
        externalMapLinks={false}
      />
      <div className={styles.profileSupplement}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Housing library</p>
            <h2 className={styles.title}>See each part of the provided housing</h2>
            <p className={styles.lede}>The canonical profile above carries the company, team, culture, management, training, season, location, housing, meals, and FAQ narrative. These four categorized images complete the fictional housing example.</p>
          </div>
        </header>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div><h3 className={styles.panelTitle}>Housing photo library</h3><p className={styles.panelNote}>Four required presentation categories, each labeled as an illustrative demo scene.</p></div>
          </div>
          <div className={styles.photoGrid}>
            {hostDemoHousingPhotos.map((photo) => (
              <figure className={styles.photoCard} key={photo.id}>
                <div className={styles.photoImage}><Image className={styles.image} src={photo.imageUrl} alt={photo.imageAlt} fill sizes="(max-width: 799px) 50vw, 25vw" /></div>
                <figcaption><strong>{photo.label}</strong><span>Illustrative demo scene</span></figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function HostDemoProfileEdit() {
  const { profile, saveProfile } = useHostDemoSession();
  const [draft, setDraft] = useState<DemoProfileDraft>(profile);
  const [saved, setSaved] = useState(false);
  const fields: readonly [keyof DemoProfileDraft, string, "input" | "textarea", string?][] = [
    ["tagline", "Profile headline", "input"],
    ["description", "About the company", "textarea"],
    ["whyWorkForUs", "Why work for us", "textarea"],
    ["team", "Team members", "textarea", "One per line: Name | Role"],
    ["activities", "Life and activities", "textarea", "One activity per line"],
    ["perks", "Perks and benefits", "textarea", "One perk per line"],
    ["housing", "Housing summary", "input"],
    ["meals", "Meals summary", "input"],
    ["culture", "Culture principles", "textarea", "One principle per line"],
    ["managementApproach", "Management approach", "textarea"],
    ["training", "Training and support", "textarea", "One item per line"],
    ["seasonRhythm", "Season rhythm", "textarea", "One milestone per line"],
    ["remoteness", "Remoteness and access", "textarea"],
    ["transportation", "Transportation", "textarea", "One option per line"],
    ["nearbyServices", "Nearby services", "textarea", "One service per line"],
    ["faqs", "Frequently asked questions", "textarea", "One per line: Question | Answer"],
  ];

  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); saveProfile(draft); setSaved(true); window.setTimeout(() => setSaved(false), 1600); }
  return <Surface><PageHeader eyebrow="Edit employer profile" title="Keep the shared story accurate once" lede="Every listing links back to this profile, so company, team, location, housing, and meal context do not need to be copied into every role." actions={<Link className={styles.buttonQuiet} href={`${ROOT}/profile`}>View profile</Link>} /><form className={styles.panel} onSubmit={onSubmit}><div className={styles.formGrid}>{fields.map(([key, label, kind, hint]) => <label className={`${styles.field} ${kind === "textarea" ? styles.fullField : ""}`} key={key}><span className={styles.fieldLabel}>{label}</span>{kind === "textarea" ? <textarea className={styles.textarea} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /> : <input className={styles.input} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />}{hint ? <span className={styles.helper}>{hint}</span> : null}</label>)}</div><div className={styles.callout} style={{ marginTop: 18 }}><strong>Media stays safe.</strong> The four sample housing images remain fixed in this public walkthrough; uploads and moderation require an authenticated host account.</div><div className={styles.actions} style={{ marginTop: 18 }}><button className={styles.button} type="submit">Save demo profile</button><span className={styles.helper}>Changes stay in this tab.</span></div>{saved ? <p className={styles.success} role="status">Profile preview updated.</p> : null}</form></Surface>;
}

export function HostDemoProfileSection({ section }: { readonly section: "team" | "location" }) {
  const { profile } = useHostDemoSession();
  const isTeam = section === "team";
  return (
    <Surface>
      <PageHeader
        eyebrow={`Employer profile · ${section}`}
        title={isTeam ? "A small crew with clear support" : `A season in ${hostDemoHost.location}`}
        lede={
          isTeam
            ? "Seekers can understand who they will work with and how the season is supported without fictional reviews or testimonials."
            : "Location context belongs beside the role, including how staff live, eat, travel, and spend days off."
        }
        actions={
          <Link className={styles.buttonQuiet} href={`${ROOT}/profile`}>
            Back to profile
          </Link>
        }
      />
      {isTeam ? (
        <div className={styles.gridThree}>
          {hostDemoTeam.map((member) => (
            <article className={styles.panel} key={member.id}>
              <span className={styles.sampleTag}>{member.initials} · fictional team member</span>
              <h2 className={styles.cardTitle} style={{ marginTop: 12 }}>{member.name}</h2>
              <p className={styles.listItemMeta}>{member.title}</p>
              <p className={styles.cardSummary}>{member.summary}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.gridTwo}>
            <section className={`${styles.panel} ${styles.copy}`}>
              <h2>About the location</h2>
              <p>{hostDemoLocation?.summary}</p>
              <h2>Living here</h2>
              <p>{hostDemoLocation?.remoteness} {profile.housing}. {profile.meals}.</p>
              <h2>Getting around</h2>
              <ul>{hostDemoLocation?.transportation.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Life outside work</h2>
              <p className={styles.panelNote}>Illustrative sample context for this fictional location.</p>
              <div className={styles.inlineActions} style={{ marginTop: 14 }}>
                {hostDemoLocation?.activities.map((activity) => <span className={styles.badge} key={activity}>{activity}</span>)}
              </div>
              <h2 className={styles.panelTitle} style={{ marginTop: 22 }}>Nearby services</h2>
              <ul className={styles.factsList} style={{ marginTop: 12 }}>
                {hostDemoLocation?.nearbyServices.map((service) => <li className={styles.fact} key={service}><strong className={styles.factValue}>{service}</strong></li>)}
              </ul>
            </section>
          </div>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>10-day location outlook</h2>
                <p className={styles.panelNote}>{hostDemoWeather.disclosure}</p>
              </div>
              <span className={styles.sampleTag}>Illustrative demo forecast</span>
            </div>
            <div className={styles.forecastGrid}>
              {hostDemoWeather.days.map((day) => (
                <div className={styles.forecastDay} key={day.id}>
                  <span>{formatDate(day.date, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</span>
                  <strong>{day.condition}</strong>
                  <small>{day.highF}° / {day.lowF}°F</small>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Surface>
  );
}

export function HostDemoPlan() {
  const live = hostDemoListings.filter((listing) => listing.status === "published").length;
  const price = formatMoney(hostDemoBilling.priceCents);
  return (
    <Surface>
      <PageHeader
        eyebrow="Billing and plan"
        title="Understand usage before activation"
        lede={`This fictional workspace demonstrates the ${hostDemoBilling.planName} surface at ${price} per month without creating a customer, opening checkout, or claiming a payment succeeded.`}
      />
      <div className={styles.callout}>
        <strong>No billing action is connected here.</strong> {hostDemoBilling.note}
      </div>
      <div className={styles.stats}>
        <Stat label="Live listings" value={`${live} / ${hostDemoBilling.entitlements.listings}`} detail="Scenario usage only" />
        <Stat label="Invite credits" value={`${hostDemoInvites.length} / ${hostDemoBilling.entitlements.includedInviteCredits}`} detail="Individual invitations" />
        <Stat label="Announcement runs" value={hostDemoBilling.entitlements.monthlyAnnouncements} detail="Monthly plan allowance" />
        <Stat label="Team seats" value={hostDemoBilling.entitlements.teamSeats} detail="Plan entitlement" />
      </div>
      <div className={styles.gridTwo}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Included workspace surfaces</h2>
          <ul className={styles.copy}>
            <li>Published listing management</li>
            <li>Applicant pipeline and interview context</li>
            <li>Application-linked messaging</li>
            <li>Individual seeker outreach</li>
            <li>Announcement composition and history</li>
            <li>All-time host analytics</li>
          </ul>
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Activation boundary</h2>
          <p className={styles.panelNote}>
            A real host can build a profile and draft roles before choosing a
            plan. Publishing and paid activation happen only from an
            authenticated account.
          </p>
          <div className={styles.actions} style={{ marginTop: 16 }}>
            <Link className={styles.button} href="/sign-up?role=host">Build a real profile</Link>
            <Link className={styles.buttonQuiet} href="/for-hosts">Return to host overview</Link>
          </div>
        </section>
      </div>
    </Surface>
  );
}

export function HostDemoSettings() {
  const { notificationSettings, saveNotificationSettings } = useHostDemoSession();
  const [draft, setDraft] = useState(notificationSettings);
  const [saved, setSaved] = useState(false);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveNotificationSettings(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <Surface>
      <PageHeader
        eyebrow="Settings"
        title="Account context and notification preferences"
        lede="This safe mirror includes the categories, channels, and quiet-hours controls used by the real workspace, while provider and account mutations stay disconnected."
      />
      <div className={styles.settingsLinks}>
        {[
          ["Plan & billing", `${hostDemoBilling.planName} sample plan`, `${ROOT}/plan`],
          ["Team", `${hostDemoTeam.length} public team profiles · 1 workspace owner`, `${ROOT}/profile/team`],
          ["Help & support", "Guides and activation boundaries", `${ROOT}/help`],
          ["Account", `${hostDemoHost.name} · fictional demo account`, `${ROOT}/profile/edit`],
        ].map(([label, detail, href]) => (
          <Link className={styles.settingsLink} href={href} key={label}>
            <span><strong>{label}</strong><small>{detail}</small></span><span aria-hidden>→</span>
          </Link>
        ))}
      </div>
      <div className={styles.callout}><strong>Session-only controls.</strong> Saving below never subscribes a device, sends an email, changes a teammate, deletes an account, or opens billing. Those actions require authentication and explicit confirmation in the real workspace.</div>
      <form className={styles.stack} onSubmit={save}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Channel master switches</h2>
          <p className={styles.panelNote}>A category cannot use a channel while its master switch is off.</p>
          <div className={styles.settingsLinks} style={{ marginTop: 16 }}>
            {([
              ["emailEnabled", "Email", "Email delivery preferences"],
              ["pushEnabled", "Push", "Push preference only — no device prompt"],
              ["inAppEnabled", "In app", "Workspace notification center"],
            ] as const).map(([key, label, detail]) => (
              <label className={styles.toggleRow} key={key}>
                <span><strong>{label}</strong><small>{detail}</small></span>
                <input type="checkbox" checked={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} />
              </label>
            ))}
          </div>
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Notification categories</h2>
          <p className={styles.panelNote}>Choose a cadence for every supported channel and category.</p>
          <div className={styles.stack} style={{ marginTop: 16 }}>
            {NOTIFICATION_CATEGORIES.map((category) => {
              const value = draft.categories[category.id];
              return (
                <fieldset className={styles.preferenceRow} key={category.id}>
                  <legend><strong>{category.label}</strong><span>{category.description}</span></legend>
                  <div className={styles.channelGrid}>
                    <label className={styles.field}><span className={styles.fieldLabel}>Email</span><select className={styles.select} value={value.email} disabled={!draft.emailEnabled} onChange={(event) => setDraft({ ...draft, categories: { ...draft.categories, [category.id]: { ...value, email: event.target.value as DemoEmailCadence } } })}>{EMAIL_CADENCES.map((cadence) => <option value={cadence} key={cadence}>{cadence}</option>)}</select></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>Push</span><select className={styles.select} value={value.push} disabled={!draft.pushEnabled} onChange={(event) => setDraft({ ...draft, categories: { ...draft.categories, [category.id]: { ...value, push: event.target.value as "immediate" | "off" } } })}><option value="immediate">on</option><option value="off">off</option></select></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>In app</span><select className={styles.select} value={value.inApp} disabled={!draft.inAppEnabled} onChange={(event) => setDraft({ ...draft, categories: { ...draft.categories, [category.id]: { ...value, inApp: event.target.value as "on" | "off" } } })}><option value="on">on</option><option value="off">off</option></select></label>
                  </div>
                </fieldset>
              );
            })}
          </div>
        </section>
        <section className={styles.panel}>
          <label className={styles.toggleRow}>
            <span><strong>Quiet hours</strong><small>Delay outbound channels during the selected local window.</small></span>
            <input type="checkbox" checked={draft.quietHours.enabled} onChange={(event) => setDraft({ ...draft, quietHours: { ...draft.quietHours, enabled: event.target.checked } })} />
          </label>
          {draft.quietHours.enabled ? (
            <div className={styles.channelGrid} style={{ marginTop: 16 }}>
              <label className={styles.field}><span className={styles.fieldLabel}>Starts</span><input className={styles.input} type="time" value={draft.quietHours.start} onChange={(event) => setDraft({ ...draft, quietHours: { ...draft.quietHours, start: event.target.value } })} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Ends</span><input className={styles.input} type="time" value={draft.quietHours.end} onChange={(event) => setDraft({ ...draft, quietHours: { ...draft.quietHours, end: event.target.value } })} /></label>
              <span className={styles.fact}><span className={styles.factLabel}>Timezone</span><strong className={styles.factValue}>{draft.quietHours.timezone}</strong></span>
            </div>
          ) : null}
        </section>
        <div className={styles.actions}>
          <button className={styles.button} type="submit">Save demo preferences</button>
          <span className={styles.helper}>Stored only for this tab.</span>
        </div>
        {saved ? <p className={styles.success} role="status">Demo preferences saved.</p> : null}
      </form>
    </Surface>
  );
}

export function HostDemoHelp() {
  return <Surface><PageHeader eyebrow="Recruiting coach and help" title="Answers beside the work they support" lede="Use these practical guides to move through the sample workspace. There is no fake AI response or support ticket behind this public walkthrough." /><div className={styles.gridTwo}><section className={styles.panel}><h2 className={styles.panelTitle}>Finish the core hiring loop</h2><div className={styles.stack} style={{ marginTop: 14 }}>{[["Check listing facts", `${ROOT}/listings`], ["Review new applicants", `${ROOT}/applicants`], ["Continue conversations", `${ROOT}/messages`], ["Read all-time analytics", `${ROOT}/dashboard`]].map(([label, href]) => <Link className={styles.listItem} href={href} key={href}><strong className={styles.listItemTitle}>{label}</strong><span aria-hidden>→</span></Link>)}</div></section><section className={styles.panel}><h2 className={styles.panelTitle}>Common questions</h2><div className={styles.stack} style={{ marginTop: 14 }}><details className={styles.fact}><summary className={styles.listItemTitle}>What changes are saved?</summary><p className={styles.panelNote}>Only session-local demo changes. Reset demo or close the tab to clear them.</p></details><details className={styles.fact}><summary className={styles.listItemTitle}>Can this contact a seeker?</summary><p className={styles.panelNote}>No. Messages, invitations, and announcements never leave the browser.</p></details><details className={styles.fact}><summary className={styles.listItemTitle}>Can this change a plan?</summary><p className={styles.panelNote}>No. Billing and publishing require an authenticated host account.</p></details></div></section></div></Surface>;
}

function HostDemoNotFound({ kind }: { readonly kind: string }) {
  return <Surface><PageHeader eyebrow="Sample workspace" title={`${kind.charAt(0).toUpperCase()}${kind.slice(1)} not found`} lede="That sample record is not part of this walkthrough, or it was cleared when the demo reset." /><div className={styles.empty}><Link className={styles.button} href={kind === "listing" ? `${ROOT}/listings` : `${ROOT}/applicants`}>Return to {kind === "listing" ? "listings" : "applicants"}</Link></div></Surface>;
}

export function HostDemoLegacyJob() {
  const first = hostDemoListings[0];
  return first ? <HostDemoListingDetail listingId={first.id} /> : <HostDemoListings />;
}

export function HostDemoSeekerPreview() {
  return <HostDemoPublicProfile />;
}
