"use client";

import { useState, type FormEvent, type ReactNode } from "react";
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
  hostDemoHost,
  hostDemoHousingPhotos,
  hostDemoInterviews,
  hostDemoInvites,
  hostDemoListingActions,
  hostDemoListings,
  hostDemoLocation,
  hostDemoNow,
  hostDemoBilling,
  hostDemoNotifications,
  hostDemoPublicListings,
  hostDemoPublicProfile,
  hostDemoRatingSummary,
  hostDemoSummary,
  hostDemoTeam,
  hostDemoThreads,
  hostDemoWeather,
  type DemoApplicationStatus,
  type HostDemoListing,
} from "./adapter";
import {
  useHostDemoSession,
  type DemoEmailCadence,
  type DemoNotificationCategory,
  type DemoProfileDraft,
} from "./HostDemoSession";
import styles from "./HostDemo.module.css";

const ROOT = "/for-hosts/demo";
const APPLICATION_STATUSES: readonly DemoApplicationStatus[] = [
  "new",
  "reviewing",
  "saved",
  "offered",
  "accepted",
  "closed",
];

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

function StatusBadge({ status }: { readonly status: string }) {
  return (
    <span className={styles.status} data-status={status}>
      {status}
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

function ListingCard({ listing }: { readonly listing: HostDemoListing }) {
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
    new: 0,
    reviewing: 0,
    saved: 0,
    offered: 0,
    accepted: 0,
    closed: 0,
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
    isNotificationRead,
  } = useHostDemoSession();
  const counts = applicationCounts(statusFor);
  const published = listings.filter((listing) => listing.status === "published");
  const unread = hostDemoThreads.filter((thread) => thread.unread).length;
  const attention = hostDemoApplications.filter((application) => statusFor(application.id) === "new").slice(0, 4);
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
        <Stat label="New applicants" value={counts.new} detail={`${counts.reviewing + counts.saved} under review`} />
        <Stat label="Upcoming interviews" value={upcomingInterviews.length} detail="Confirmed sample records" />
        <Stat label="Offers awaiting response" value={counts.offered} detail={`${counts.accepted} accepted`} />
        <Stat label="Unread messages" value={unread} detail={`${hostDemoThreads.length} conversations`} />
        <Stat label="Profile completion" value={`${hostDemoSummary.profileCompletion}%`} detail="One optional FAQ remains" />
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
                  <span className={styles.score}>{application.match}%</span>
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
  const { listingFor, transitionListing, duplicateListing } = useHostDemoSession();
  const [notice, setNotice] = useState<string | null>(null);
  const listing = listingFor(listingId);
  if (!listing) return <HostDemoNotFound kind="listing" />;
  const applications = hostDemoApplications.filter((application) => application.listingId === listing.id);
  const lifecycleActions = hostDemoListingActions(listing.status);

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
            ].map(([label, value]) => (
              <span className={styles.fact} key={label}><span className={styles.factLabel}>{label}</span><strong className={styles.factValue}>{value}</strong></span>
            ))}
          </div>
          <div className={styles.actions} style={{ marginTop: 16 }}>
            <Link className={styles.button} href={`${ROOT}/applicants`}>View applicants</Link>
            <Link className={styles.buttonQuiet} href={`${ROOT}/listings/${listing.id}/edit`}>Edit</Link>
            <button className={styles.buttonQuiet} type="button" onClick={duplicate}>Duplicate</button>
            {lifecycleActions.map((action) => (
              <button
                className={action.variant === "primary" ? styles.button : styles.buttonQuiet}
                type="button"
                key={action.status}
                onClick={() => {
                  transitionListing(listing.id, action.status);
                  setNotice(`${action.label} completed in this demo.`);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          {notice ? <p className={styles.success} role="status">{notice}</p> : null}
          <p className={styles.helper}>These are the same lifecycle choices the product supports: live roles pause or archive rather than “close,” and closed verified roles reopen as drafts. Every action here remains session-local; no plan, payment, or real listing changes.</p>
        </aside>
      </div>
    </Surface>
  );
}

export function HostDemoNewListing() {
  const router = useRouter();
  const { createDraft } = useHostDemoSession();
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const id = createDraft({
      title: String(data.get("title") ?? ""),
      location: String(data.get("location") ?? ""),
      startDate: String(data.get("startDate") ?? ""),
      endDate: String(data.get("endDate") ?? ""),
      pay: String(data.get("pay") ?? ""),
      housing: String(data.get("housing") ?? ""),
      meals: String(data.get("meals") ?? ""),
      summary: String(data.get("summary") ?? ""),
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
          <label className={styles.field}><span className={styles.fieldLabel}>Pay</span><input className={styles.input} name="pay" required defaultValue="$18/hr" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Begins</span><input className={styles.input} name="startDate" type="date" required defaultValue="2026-05-18" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Ends</span><input className={styles.input} name="endDate" type="date" required defaultValue="2026-10-04" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Application deadline</span><input className={styles.input} name="applicationDeadline" type="date" defaultValue="2026-08-25" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Open positions</span><input className={styles.input} name="openPositions" type="number" min="1" max="100" required defaultValue="1" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing</span><input className={styles.input} name="housing" required defaultValue={hostDemoHost.housing} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meals</span><input className={styles.input} name="meals" required defaultValue={hostDemoHost.meals} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Position summary</span><textarea className={styles.textarea} name="summary" required defaultValue="Welcome guests, coordinate arrivals, and keep the front desk calm and helpful throughout the season." /></label>
        </div>
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

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateListing(draft);
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
          <label className={styles.field}><span className={styles.fieldLabel}>Pay</span><input className={styles.input} required value={draft.pay} onChange={(event) => setDraft({ ...draft, pay: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Begins</span><input className={styles.input} required value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Ends</span><input className={styles.input} required value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Application deadline</span><input className={styles.input} value={draft.applicationDeadline === "No deadline" ? "" : draft.applicationDeadline} onChange={(event) => setDraft({ ...draft, applicationDeadline: event.target.value || "No deadline", applicationDeadlineDetail: event.target.value ? "Deadline edited in this demo" : "No application deadline set" })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Open positions</span><input className={styles.input} type="number" min="1" max="100" required value={draft.openPositions} onChange={(event) => setDraft({ ...draft, openPositions: Math.max(1, Number(event.target.value) || 1) })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Housing</span><input className={styles.input} required value={draft.housing} onChange={(event) => setDraft({ ...draft, housing: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Meals</span><input className={styles.input} required value={draft.meals} onChange={(event) => setDraft({ ...draft, meals: event.target.value })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Short summary</span><textarea className={styles.textarea} required value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>About the position</span><textarea className={styles.textarea} required value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Requirements</span><textarea className={styles.textarea} value={draft.requirements.join("\n")} onChange={(event) => setDraft({ ...draft, requirements: nonEmptyLines(event.target.value) })} /><span className={styles.helper}>One requirement per line.</span></label>
          <label className={`${styles.field} ${styles.fullField}`}><span className={styles.fieldLabel}>Benefits and highlights</span><textarea className={styles.textarea} value={draft.highlights.join("\n")} onChange={(event) => setDraft({ ...draft, highlights: nonEmptyLines(event.target.value) })} /><span className={styles.helper}>One item per line.</span></label>
        </div>
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
      <PageHeader eyebrow="Applicants" title="A decision pipeline with one source of truth" lede="Applications move through the six stages the product actually stores. Interviews appear alongside an application as scheduled events, never as a made-up seventh stage." />
      <div className={styles.pipeline} aria-label="Application stage totals">
        {APPLICATION_STATUSES.map((status) => <button className={styles.pipelineStage} type="button" key={status} onClick={() => setStage(status)} aria-pressed={stage === status}><span>{status}</span><strong>{counts[status]}</strong></button>)}
      </div>
      <div className={styles.filterBar} style={{ marginTop: 16 }}>
        <label className={styles.search}><span className={styles.srOnly}>Search applicants</span><input className={styles.input} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search seeker or listing" /></label>
        <label className={styles.selectWrap}><span className={styles.srOnly}>Filter by stage</span><select className={styles.select} value={stage} onChange={(event) => setStage(event.target.value as "all" | DemoApplicationStatus)}><option value="all">All stages</option>{APPLICATION_STATUSES.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
      </div>
      <div className={styles.panel}>
        <ul className={styles.list}>
          {visible.map((application) => (
            <li className={styles.listItem} key={application.id}>
              <span className={styles.listItemMain}>
                <Link className={styles.listItemTitle} href={`${ROOT}/applicants/${application.id}`}>{application.seekerName}</Link>
                <span className={styles.listItemMeta}>{application.listingTitle} · {application.availability} · applied {application.appliedAt}</span>
              </span>
              <div className={styles.inlineActions}><span className={styles.score}>{application.match}%</span><StatusBadge status={statusFor(application.id)} /><Link className={styles.buttonQuiet} href={`${ROOT}/applicants/${application.id}`}>Review</Link></div>
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
  const { statusFor, transitionApplication } = useHostDemoSession();
  const [notice, setNotice] = useState<string | null>(null);
  if (!application) return <HostDemoNotFound kind="application" />;
  const interview = hostDemoInterviews.find((item) => item.applicationId === application.id);
  const thread = hostDemoThreads.find((item) => item.applicationId === application.id);
  const status = statusFor(application.id);
  const actions = hostDemoApplicationActions(status);

  return (
    <Surface>
      <PageHeader eyebrow="Applicant review" title={application.seekerName} lede={`${application.listingTitle} · ${application.match}% match · applied ${application.appliedAt}`} actions={<Link className={styles.buttonQuiet} href={`${ROOT}/applicants`}>Back to pipeline</Link>} />
      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHead}><div><h2 className={styles.panelTitle}>Application</h2><p className={styles.panelNote}>{application.bio}</p></div><span className={styles.score}>{application.match}%</span></div>
            <div className={styles.gridThree}>
              <span className={styles.fact}><span className={styles.factLabel}>Availability</span><strong className={styles.factValue}>{application.availability}</strong></span>
              <span className={styles.fact}><span className={styles.factLabel}>Housing</span><strong className={styles.factValue}>{application.housingNeed}</strong></span>
              <span className={styles.fact}><span className={styles.factLabel}>Meals</span><strong className={styles.factValue}>{application.mealsNeed}</strong></span>
            </div>
            <h3 className={styles.cardTitle} style={{ marginTop: 20 }}>Skills and strengths</h3>
            <div className={styles.inlineActions} style={{ marginTop: 10 }}>{application.skills.map((skill) => <span className={styles.badge} key={skill}>{skill}</span>)}</div>
          </section>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Application statement</h2>
            <p className={styles.panelNote}>{application.coverNote}</p>
            <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}>
              <strong>Private note editing is not simulated.</strong> The current production applicant surface does not expose a supported private-note save action, so this walkthrough does not invent one.
            </div>
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
                  transitionApplication(application.id, action.status);
                  setNotice(`${action.label} completed in this demo.`);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          {actions.length === 0 ? <p className={styles.helper}>No further host transition is available from <strong>{status}</strong>. Terminal and engagement states never show invalid controls.</p> : <p className={styles.helper}>Only transitions allowed from <strong>{status}</strong> are shown.</p>}
          {notice ? <p className={styles.success} role="status">{notice}</p> : null}
          {interview ? <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}><strong>Interview scheduled</strong><br />{interview.startsAt}<br />{interview.format}</div> : <div className={styles.callout} style={{ marginTop: 16, marginBottom: 0 }}><strong>No interview scheduled.</strong> Scheduling requires an authenticated availability workflow and is intentionally not fabricated here.</div>}
          <div className={styles.actions} style={{ marginTop: 16 }}>{thread ? <Link className={styles.button} href={`${ROOT}/messages/${thread.id}`}>Open conversation</Link> : null}<Link className={styles.buttonQuiet} href={`${ROOT}/listings/${application.listingId}`}>View role</Link></div>
        </aside>
      </div>
    </Surface>
  );
}

export function HostDemoMessages({ threadId }: { readonly threadId?: string }) {
  const active = threadId ? findHostDemoThread(threadId) : undefined;
  const { replies, sendReply } = useHostDemoSession();
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const visible = hostDemoThreads.filter((thread) => thread.seekerName.toLowerCase().includes(query.toLowerCase()) || thread.listingTitle.toLowerCase().includes(query.toLowerCase()));
  const activeApplication = active ? hostDemoApplications.find((application) => application.id === active.applicationId) : undefined;
  const messages = active ? [...active.messages, ...(replies[active.id] ?? [])] : [];

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
          <div className={styles.stack} style={{ marginTop: 10 }}>{visible.map((thread) => <Link className={styles.thread} data-active={thread.id === active?.id} href={`${ROOT}/messages/${thread.id}`} key={thread.id}><span className={styles.threadName}><span>{thread.unread ? <><span className={styles.unreadDot} aria-hidden /><span className={styles.srOnly}>Unread conversation: </span></> : null}{thread.seekerName}</span><small>{thread.updatedLabel}</small></span><span className={styles.listItemMeta}>{thread.listingTitle}</span><span className={styles.cardSummary}>{thread.messages.at(-1)?.body}</span></Link>)}</div>
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
  const { statusFor, listings } = useHostDemoSession();
  const counts = applicationCounts(statusFor);
  const total = hostDemoApplications.length;
  const activeReview = counts.reviewing + counts.saved;
  const maxCount = Math.max(1, ...listings.map((listing) => listing.applications));

  return (
    <Surface>
      <PageHeader eyebrow="Analytics" title="All-time totals you can trace back to a person and role" lede="The current product records aggregate pipeline and per-listing performance. This walkthrough intentionally omits unsupported trends, traffic-source attribution, and forecasts." />
      <div className={styles.callout}><strong>Scope: all time through {hostDemoNow}.</strong> Date-bucketed trends are not available yet, so this view does not pretend they are.</div>
      <div className={styles.stats}><Stat label="Applications" value={total} detail="Across sample listings" /><Stat label="In review" value={activeReview} detail="Reviewing and saved" /><Stat label="Offers awaiting response" value={counts.offered} detail="Current offered stage" /><Stat label="Upcoming interviews" value={hostDemoSummary.upcomingInterviews} detail="Selected future records" /><Stat label="Accepted" value={counts.accepted} detail="Current accepted stage" /><Stat label="Profile completion" value={`${hostDemoSummary.profileCompletion}%`} detail="Weighted checklist" /></div>
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
                      <StatusBadge status={invite.status} />
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
  const { profile } = useHostDemoSession();
  return (
    <div className={styles.demo}>
      <div className={styles.profileEditBar}>
        <span>
          <strong>Canonical seeker-facing profile</strong>
          <small>Fictional sample data · no reviews are invented</small>
        </span>
        <Link className={styles.button} href={`${ROOT}/profile/edit`}>
          Edit sample profile
        </Link>
      </div>
      <PublicHostProfileView
        host={{
          ...hostDemoPublicProfile,
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
          housingOfferedGenerally: Boolean(profile.housing.trim()),
          mealsOfferedGenerally: Boolean(profile.meals.trim()),
        }}
        listings={hostDemoPublicListings}
        ratingSummary={hostDemoRatingSummary}
        reviews={[]}
        coverPhotoUrl={hostDemoHost.imageUrl}
        browseHref={`${ROOT}/listings`}
        listingHrefPrefix={`${ROOT}/listings`}
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
  return <HostDemoProfile />;
}
