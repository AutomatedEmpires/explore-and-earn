import type { Metadata } from "next";
import Link from "next/link";

import { Icon, type IconKey } from "@explore-and-earn/ui";

import { CaptureOnClick } from "../../../components/analytics/CaptureOnClick";
import { CaptureOnMount } from "../../../components/analytics/CaptureOnMount";
import { ListingCardGrid } from "../../../components/discovery";
import { SitePhoto } from "../../../components/media/SitePhoto";
import { PUBLIC_IA_EVENTS } from "../../../lib/analytics";
import { getLandingListings } from "../../../lib/landingInventory";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "For seekers — work somewhere worth waking up in",
  description:
    "Every Explore & Earn listing states housing, meals and pay before you apply. Browse the whole grid, swipe one role at a time, or find work by place in the map view. Free forever for seekers.",
  alternates: { canonical: "/for-seekers" },
  openGraph: {
    title: "For seekers · Explore & Earn",
    description:
      "Housing, meals and pay on the face of every listing. Three ways to find seasonal work — and you never pay to use any of them.",
    type: "website",
  },
};

/**
 * ISR, matching /for-hosts. The page reads live inventory for its preview row,
 * so it cannot be a build-time artefact for ever; it is also almost entirely
 * static, so rendering it per request to keep three cards fresh would be paying
 * for the whole page to chase a row that changes when a host publishes.
 */
export const revalidate = 300;

/** Cards in the "what a listing looks like" row. Three reads as a sample. */
const PREVIEW_SLOTS = 3;

const TRIAD: readonly {
  readonly key: string;
  readonly label: string;
  readonly question: string;
  readonly body: string;
  readonly icon: IconKey;
}[] = [
  {
    key: "housing",
    label: "Housing",
    question: "Where will I sleep?",
    icon: "benefit.housing",
    body: "Cabin, bunkhouse, crew quarters, or nothing at all — the listing names it. A host who has not answered cannot publish, and a listing we ingested from elsewhere says “not stated” instead of guessing.",
  },
  {
    key: "meals",
    label: "Meals",
    question: "What will I eat?",
    icon: "benefit.meals",
    body: "Provided, a stipend, or a kitchen you can use. Stated the same way on every card, so you can compare two seasons without reading two job descriptions to the bottom.",
  },
  {
    key: "pay",
    label: "Pay",
    question: "What will I earn?",
    icon: "benefit.pay",
    body: "Real numbers, before you apply. No “competitive”, no “DOE”, and no range invented on your behalf when the host did not give one.",
  },
];

const MODES: readonly {
  readonly key: string;
  readonly name: string;
  readonly href: string;
  readonly icon: IconKey;
  readonly body: string;
  readonly photo: string;
}[] = [
  {
    key: "seek",
    name: "Seek",
    href: "/for-seekers/demo/seek",
    icon: "nav.seek",
    photo: "lodge-02",
    body: "The whole grid, with filters that match how the decision is actually made: housing, meals, pay band, lane and dates. Every card carries the triad, so filtering never hides the thing you were filtering for.",
  },
  {
    key: "swipe",
    name: "Swipe",
    href: "/for-seekers/demo/swipe",
    icon: "nav.swipe",
    photo: "dock-01",
    body: "One role at a time, built for a phone. Keep it or let it go — a save is yours to come back to, and nothing you skip is shown to you again as if it were new.",
  },
  {
    key: "map",
    name: "Map",
    href: "/for-seekers/demo/map",
    icon: "nav.map",
    photo: "idaho-03",
    body: "A location-first view with the same opportunity details. If the place decides the season for you, start there and compare roles by region.",
  },
];

const STEPS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: "Browse before you decide anything",
    body: "No account, no email, no “unlock this listing”. Seek, Swipe and Map are open to anyone, and every listing shows the same three answers whether you are signed in or not.",
  },
  {
    title: "Make a profile when you want to apply",
    body: "Your profile is where you say when you are free, what you can do, and what you need from a season. It takes three short steps and you can skip any of them.",
  },
  {
    title: "Apply, and see why you matched",
    body: "Match scores come from what both sides stated — your availability against the dates, the benefits you need against the ones offered. The reasons are always visible, including the ones that say information was missing.",
  },
  {
    title: "Track it in one place",
    body: "Saved roles, applications, invitations, offers and messages live in your dashboard instead of your inbox. Hosts message you inside the application they are messaging you about.",
  },
];

export default async function ForSeekersPage() {
  const inventory = await getLandingListings(PREVIEW_SLOTS);
  const showingExamples = inventory.source === "example";

  return (
    <div className={styles.page}>
      <CaptureOnMount
        event={PUBLIC_IA_EVENTS.roleGatewayViewed}
        properties={{ role: "seeker" }}
      />

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="seekers-hero-title">
        <div className={styles.heroMedia}>
          <SitePhoto
            slug="paddle-01"
            size="hero"
            priority
            className={styles.heroPhoto}
            sizes="100vw"
          />
          <span className={styles.heroScrim} aria-hidden="true" />
        </div>
        <div className={styles.heroInner}>
          <p className={styles.heroEyebrow}>For seekers</p>
          <h1 id="seekers-hero-title" className={styles.heroTitle}>
            Work somewhere worth waking up in
          </h1>
          <p className={styles.heroSub}>
            Seasonal and lifestyle work where the listing tells you where
            you&rsquo;ll sleep, what you&rsquo;ll eat and what you&rsquo;ll earn
            — before you apply. Free forever, for every seeker.
          </p>
          <div className={styles.heroActions}>
            <CaptureOnClick
              className={styles.primaryLg}
              href="/for-seekers/demo"
              event={PUBLIC_IA_EVENTS.forSeekersCtaSelected}
              properties={{ cta: "open_full_demo" }}
            >
              <Icon name="action.view" size={20} aria-hidden />
              Explore a populated account
            </CaptureOnClick>
            <CaptureOnClick
              className={styles.ghostLg}
              href="/seek"
              event={PUBLIC_IA_EVENTS.forSeekersCtaSelected}
              properties={{ cta: "browse_anonymous" }}
            >
              <Icon name="nav.seek" size={20} aria-hidden />
              Browse without an account
            </CaptureOnClick>
          </div>
        </div>
      </section>

      {/* ── The triad ──────────────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="triad-title">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>The deal, upfront</p>
          <h2 id="triad-title" className={styles.sectionTitle}>
            Three questions, answered on every card
          </h2>
          <p className={styles.sectionSub}>
            Most job boards bury housing and pay in the description, if they
            state them at all. Here they are structured fields, which is why a
            filter for them can be trusted.
          </p>
        </div>
        <div className={styles.triadGrid}>
          {TRIAD.map((item) => (
            <article key={item.key} className={styles.triadCard}>
              <span className={styles.triadIcon} aria-hidden>
                <Icon name={item.icon} size={24} />
              </span>
              <h3 className={styles.triadLabel}>{item.label}</h3>
              <p className={styles.triadQuestion}>{item.question}</p>
              <p className={styles.triadBody}>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Real cards ─────────────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="cards-title">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>What you&rsquo;ll actually see</p>
          <h2 id="cards-title" className={styles.sectionTitle}>
            {showingExamples
              ? "This is the card, rendered from example roles"
              : "Open right now"}
          </h2>
          <p className={styles.sectionSub}>
            {showingExamples
              ? "The production card component, rendering example roles — not a drawing of it. Every control on it works the way it does in Seek."
              : "Live listings, rendered by the same component Seek uses. Housing, meals and pay are on the face of each one."}
          </p>
        </div>

        {inventory.listings.length === 0 ? (
          <div className={styles.emptyPanel}>
            <Icon name="status.open" size={24} aria-hidden />
            <p className={styles.emptyTitle}>No roles listed yet.</p>
            <p className={styles.emptySub}>
              We only publish opportunities that answer housing, meals and pay
              upfront — so this stays empty until they do.
            </p>
            <Link className={styles.inlineLink} href="/seek">
              Open the marketplace
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>
        ) : (
          <>
            {showingExamples ? (
              <p className={styles.exampleLabel}>
                <Icon name="system.info" size={16} aria-hidden />
                Example listings — invented roles, shown so the card is not an
                empty frame. Nothing here is a real opening.
              </p>
            ) : null}
            <ListingCardGrid
              listings={inventory.listings}
              surface="discovery_feed"
              eagerCount={1}
              className={styles.cardGrid}
            />
            <Link className={styles.inlineLink} href="/seek">
              Browse every open role
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </>
        )}
      </section>

      {/* ── Three ways in ──────────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="modes-title">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Discover your way</p>
          <h2 id="modes-title" className={styles.sectionTitle}>
            Three ways in — the same honest listings
          </h2>
          <p className={styles.sectionSub}>
            They are different surfaces, not different inventory. A published
            role appears in all three, and all three are open without an
            account.
          </p>
        </div>
        <div className={styles.modeGrid}>
          {MODES.map((mode) => (
            <Link key={mode.key} className={styles.modeCard} href={mode.href}>
              <span className={styles.modeMedia}>
                <SitePhoto
                  slug={mode.photo}
                  size="card"
                  decorative
                  className={styles.modePhoto}
                  sizes="(min-width: 900px) 22rem, 100vw"
                />
              </span>
              <span className={styles.modeBody}>
                <span className={styles.modeName}>
                  <Icon name={mode.icon} size={20} aria-hidden />
                  {mode.name}
                </span>
                <span className={styles.modeText}>{mode.body}</span>
                <span className={styles.modeCta}>
                  Open {mode.name}
                  <Icon name="action.forward" size={16} aria-hidden />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section
        id="how-it-works"
        className={styles.section}
        aria-labelledby="how-title"
      >
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="how-title" className={styles.sectionTitle}>
            Four steps, and the first one needs nothing from you
          </h2>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden>
                {index + 1}
              </span>
              <span className={styles.stepText}>
                <span className={styles.stepTitle}>{step.title}</span>
                <span className={styles.stepBody}>{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Community + free forever ───────────────────────────────── */}
      <section className={styles.section} aria-labelledby="community-title">
        <div className={styles.split}>
          <div className={styles.splitMedia}>
            <SitePhoto
              slug="crew-03"
              size="card"
              className={styles.splitPhoto}
              sizes="(min-width: 900px) 30rem, 100vw"
            />
          </div>
          <div className={styles.splitBody}>
            <p className={styles.eyebrow}>Community</p>
            <h2 id="community-title" className={styles.sectionTitle}>
              The listing tells you what&rsquo;s open. Seekers tell you what
              it&rsquo;s like.
            </h2>
            <p className={styles.sectionSub}>
              Community is a seeker space: photos from the season, notes on
              housing and crews, and announcements from hosts who are hiring.
              It sits behind a sign-in because the people posting are sharing
              where they live and work, and that is not a thing to publish to
              the open web.
            </p>
            <p className={styles.freeLine}>
              <Icon name="system.success" size={16} aria-hidden />
              Free forever. Seekers never pay on Explore &amp; Earn — hosts fund
              the marketplace, and no feature here is behind a seeker paywall.
            </p>
            <CaptureOnClick
              className={styles.inlineLink}
              href="/community"
              event={PUBLIC_IA_EVENTS.forSeekersCtaSelected}
              properties={{ cta: "community" }}
            >
              Sign in to open Community
              <Icon name="action.forward" size={16} aria-hidden />
            </CaptureOnClick>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section className={styles.finalCta} aria-labelledby="final-title">
        <h2 id="final-title" className={styles.finalTitle}>
          Start where you like
        </h2>
        <p className={styles.finalSub}>
          Browse first and sign up later, or make the profile now so a host can
          find you. Both doors lead to the same marketplace.
        </p>
        <div className={styles.heroActions}>
          <CaptureOnClick
            className={styles.primaryLg}
            href="/sign-up?role=seeker"
            event={PUBLIC_IA_EVENTS.forSeekersCtaSelected}
            properties={{ cta: "create_account_final" }}
          >
            <Icon name="nav.seek" size={20} aria-hidden />
            Create a free account
          </CaptureOnClick>
          <CaptureOnClick
            className={styles.ghostLgDark}
            href="/seek"
            event={PUBLIC_IA_EVENTS.forSeekersCtaSelected}
            properties={{ cta: "browse_anonymous_final" }}
          >
            Browse without an account
          </CaptureOnClick>
        </div>
      </section>
    </div>
  );
}
