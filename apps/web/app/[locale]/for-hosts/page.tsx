import type { Metadata } from "next";
import Link from "next/link";

import {
  ANNUAL_MONTHS_BILLED,
  ADDON_PRICING,
  BOOST_DURATIONS,
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";
import { getFoundingHostProgram } from "@explore-and-earn/db";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { CaptureOnMount } from "../../../components/analytics/CaptureOnMount";
import { SectionViewed } from "../../../components/analytics/SectionViewed";
import {
  DEMO_DATA_LABEL,
  DEMO_ORG,
  DemoJobCard,
  DemoMetricTiles,
} from "../../../components/demo";
import { FoundingHostSection } from "../../../components/founding/FoundingHostSection";
import { resolveFoundingProgramView } from "../../../components/founding/program";
import { AddOnTable } from "../../../components/pricing/AddOnTable";
import { HOST_FUNNEL_EVENTS } from "../../../lib/analytics";
import { formatMoney } from "../../../lib/format";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Host on Explore & Earn — see the product before the price",
  description:
    "Walk a live Enterprise demo workspace: the employer profile, the opportunity card seekers actually see, Seek/Swipe/Map discovery, match scores, the applicant pipeline, announcements, and analytics. Build your profile and draft roles for free; a plan is what makes them publishable.",
  // Canonical guards the revenue-side acquisition page against UTM/query
  // variants indexing as duplicates (review 2026-07-22).
  alternates: { canonical: "/for-hosts" },
  openGraph: {
    title: "Host on Explore & Earn",
    description:
      "See the host workspace running before you pay for it — profile, listings, discovery, matching, applicants, announcements, analytics.",
    type: "website",
  },
};

/**
 * This page reads the early-host programme row, so it can no longer be a
 * build-time artefact for ever: a capacity the founder sets after a deploy, or a
 * place claimed by a paid checkout, has to reach the page without one.
 *
 * ISR RATHER THAN force-dynamic, deliberately. This is the highest-traffic
 * marketing surface in the product and almost all of it is static; rendering it
 * per request to keep one figure fresh would be paying for the whole page to
 * chase a number that changes a hundred times in the programme's entire life.
 * The admin console additionally calls revalidatePath('/for-hosts') the moment
 * the configuration changes, so the window below only ever bounds the CLAIMED
 * count — and a stale count can never sell a place that does not exist, because
 * the checkout action re-reads the row and refuses.
 */
export const revalidate = 300;

// ─── Content data ──────────────────────────────────────────────────────────

const PAID_TIERS = ["starter", "professional", "enterprise"] as const;
type PaidTier = (typeof PAID_TIERS)[number];

function tierName(tier: PaidTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * Plan features, DERIVED from PLAN_ENTITLEMENTS — never typed as marketing
 * copy. A number here is the number the server enforces, which is the only way
 * a plan card cannot promise something the plan does not grant.
 *
 * The colleague-seat entitlement is deliberately NOT read here. Accepting an
 * invitation grants no access to any listing, applicant, conversation or
 * analytic today, so no surface may advertise one — the seat-capability guard
 * test in packages/db holds the entitlement at zero, and the fixture-integrity
 * test holds this page to silence about it.
 */
function planFeatures(tier: PaidTier): readonly string[] {
  const entitlement = PLAN_ENTITLEMENTS[tier];
  const features = [
    `${entitlement.listings} active ${entitlement.listings === 1 ? "listing" : "listings"}`,
    `${entitlement.includedInviteCredits} invite credits a month`,
    entitlement.analytics === "full"
      ? "Full analytics, including the per-listing breakdown"
      : "Account-wide analytics",
  ];
  if (entitlement.monthlyAnnouncements > 0) {
    features.push(
      `${entitlement.monthlyAnnouncements} community ${
        entitlement.monthlyAnnouncements === 1 ? "announcement" : "announcements"
      } a month`,
    );
  }
  return features;
}

const DISCOVERY_MODES: readonly {
  readonly icon: IconKey;
  readonly title: string;
  readonly href: string;
  readonly body: string;
}[] = [
  {
    icon: "nav.seek",
    title: "Seek",
    href: "/seek",
    body: "Filtered browsing. Seekers narrow by housing, meals, pay, lane and dates — so a role that states all three shows up in searches a vague one never reaches.",
  },
  {
    icon: "nav.swipe",
    title: "Swipe",
    href: "/swipe",
    body: "One card at a time, on a phone, usually in the evening. A save here is a strong signal: they read the whole card and kept it.",
  },
  {
    icon: "nav.map",
    title: "Map",
    href: "/map",
    body: "A real map, not a picture of one. Seekers who pick a region before they pick a job find you by where you are.",
  },
];

const WORKFLOW: readonly {
  readonly icon: IconKey;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly linkLabel: string;
}[] = [
  {
    icon: "status.match",
    title: "Applicants arrive scored",
    body: "Each application carries a match score computed from availability, the benefits the seeker needs, and their stated preferences. The score is stored with the application, so the number on the card is the number in your pipeline.",
    href: "/for-hosts/demo/applicants",
    linkLabel: "See the pipeline",
  },
  {
    icon: "action.message",
    title: "Messaging where the decision is",
    body: "The thread sits beside the application. “Is the cabin a private room?” stays attached to the person who asked it instead of disappearing into a personal inbox.",
    href: "/for-hosts/demo/applicants",
    linkLabel: "See a thread",
  },
  {
    icon: "nav.announcements",
    title: "Announcements reach past your listing",
    body: "A hiring push, a housing update, a closing date — sent across the marketplace to seekers who have not found your roles yet. Included monthly on paid plans, with extra runs available.",
    href: "/for-hosts/demo/announcements",
    linkLabel: "See announcements",
  },
  {
    icon: "status.boosted",
    title: "Boost when a role has to fill",
    body: "Push one listing up in discovery for a fixed window. Exposure only — a boost never changes a match score, because a bought score would make every score worthless.",
    href: "/for-hosts/demo/job",
    linkLabel: "See the card",
  },
];

/**
 * "Traditional listing platform vs Explore & Earn" (spec D11).
 *
 * The left column describes the GENERAL job-board pattern. No company is named,
 * no competitor price is quoted, and nothing here asserts a fact about a
 * specific product we have not verified — which is exactly why the generic
 * column stands instead of a named one.
 */
const COMPARISON: readonly {
  readonly row: string;
  readonly traditional: string;
  readonly ours: string;
}[] = [
  {
    row: "Employer profile",
    traditional: "A company name on a job post.",
    ours: "A profile carrying your season, crew size, housing and meals — every role inherits it instead of repeating it.",
  },
  {
    row: "Housing, meals & pay",
    traditional: "Buried in the description, when they are stated at all.",
    ours: "Three structured fields on the face of every card. A listing that leaves one blank cannot be published.",
  },
  {
    row: "Discovery modes",
    traditional: "A keyword search box.",
    ours: "Seek for filtered browsing, Swipe for one-at-a-time on a phone, and a real map for place-first seekers.",
  },
  {
    row: "Matching",
    traditional: "Keyword relevance against the words you typed.",
    ours: "A stored match score built from availability, benefits and stated preferences — visible to both sides.",
  },
  {
    row: "Applicant management",
    traditional: "Applications land in your email.",
    ours: "A pipeline with stages, scores and the signals behind them.",
  },
  {
    row: "Messaging",
    traditional: "Your own inbox, outside the system.",
    ours: "A thread attached to the application it belongs to.",
  },
  {
    row: "Announcements",
    traditional: "Repost the job and hope it resurfaces.",
    ours: "Marketplace-wide announcements with a monthly allowance on paid plans.",
  },
  {
    row: "Analytics",
    traditional: "A view count, if anything.",
    ours: "Applications by stage and invite acceptance on every plan; per-listing diagnosis on the higher plans.",
  },
  {
    row: "Pricing transparency",
    traditional: "Quote on request.",
    ours: "Three prices published on this page. Annual is ten monthly payments. Cancel whenever you like.",
  },
  {
    row: "Mobile experience",
    traditional: "A desktop site shrunk onto a phone.",
    ours: "Built mobile-first — the swipe surface only makes sense on a phone in the first place.",
  },
];

const FAQ: readonly { readonly q: string; readonly a: string }[] = [
  {
    q: "What do I get before I pay anything?",
    a: "Create an account, build your employer profile, brand it, draft your roles, and preview exactly how they will look to a seeker — all without a plan. A plan is what makes a role publishable, discoverable, and able to receive applications, messages and announcements.",
  },
  {
    q: "What does each plan include?",
    a: "Active listings, monthly invite credits, and analytics depth — with community announcements on the higher plans. The exact figures are on the cards above; they are read from the same contract the server enforces, so what a card says is what your account gets.",
  },
  {
    q: "How does annual billing work?",
    a: `Annual billing is exactly ${ANNUAL_MONTHS_BILLED} monthly payments taken once a year — two months free. There is no minimum term and no separate annual product.`,
  },
  {
    q: "Can I cancel?",
    a: "Yes, at any time, from your billing settings. Your plan runs to the end of the period you have paid for; after that your listings stop being discoverable and your workspace goes back to the build-and-draft state.",
  },
  {
    q: "What about refunds?",
    a: "Subscription refunds are reviewed case by case through the refund queue in your workspace and are settled against the actual charge. Invite credits are non-refundable once purchased, which is stated at the point of purchase rather than in the small print.",
  },
  {
    q: "What are the add-ons?",
    a: `Boosts push one listing up in discovery for ${BOOST_DURATIONS.join(", ")} days. Extra community announcement runs are ${formatMoney(ADDON_PRICING.additionalAnnouncement.priceCents)} for a single ${ADDON_PRICING.additionalAnnouncement.runDays}-day run. Extra active listings and invite credit packs are available on top of your plan's allowance.`,
  },
  {
    q: "How do seekers actually find my roles?",
    a: "Three ways, and they behave differently: Seek is filtered browsing, Swipe is one card at a time on a phone, and Map is place-first. A published role appears in all three. Match scores then order what each seeker sees.",
  },
  {
    q: "Is anything in the demo real?",
    a: "No, and every screen says so. The demo workspace runs on fixtures — an invented organisation, an invented role, invented figures — rendered by the real product components. We do not publish counts, testimonials or results we cannot evidence.",
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function ForHostsPage() {
  // The early-host programme, read from the database on every request. Null —
  // no row, a draft row, or a read fault — resolves to the view that renders one
  // qualitative sentence and no figure of any kind. This page never invents a
  // capacity, a remainder or a deadline, and the guardrail fails the build if a
  // count reaches it from anywhere but the program module.
  const foundingView = resolveFoundingProgramView(await getFoundingHostProgram());

  return (
    <div className={styles.page}>
      <CaptureOnMount event={HOST_FUNNEL_EVENTS.hostLandingViewed} />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="hosts-hero-title">
        <div className={styles.heroFrame}>
          <div className={styles.heroScrim} aria-hidden="true" />
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>For hosts</p>
            <h1 id="hosts-hero-title" className={styles.heroTitle}>
              See the product before the price
            </h1>
            <p className={styles.heroSub}>
              Build your employer profile, draft your roles, and preview
              everything a seeker will see — for free. A plan is what makes a
              role publishable. Walk the whole workspace first.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.startBtnLg} href="/sign-up?role=host">
                <Icon name="nav.host" size={20} aria-hidden />
                Build your host profile
              </Link>
              <Link className={styles.ghostBtnLg} href="/for-hosts/demo">
                <Icon name="action.view" size={20} aria-hidden />
                Explore the live demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── The card a seeker sees ────────────────────────────────── */}
      <section className={styles.previewWrap} aria-labelledby="card-preview-title">
        <div className={styles.sectionHead}>
          <h2 id="card-preview-title" className={styles.sectionTitle}>
            This is the card a seeker sees
          </h2>
          <p className={styles.sectionSub}>
            Not a drawing of it — the production component, rendering a demo
            role. Housing, meals and pay are on its face, because those are what
            decide whether someone can take the job.
          </p>
        </div>
        <DemoJobCard />
        <p className={styles.previewNote}>
          {DEMO_DATA_LABEL} · every control on this card leads into the demo
          workspace.
        </p>
      </section>

      {/* ── Employer profile ──────────────────────────────────────── */}
      <section className={styles.split} aria-labelledby="profile-title">
        <div>
          <h2 id="profile-title" className={styles.sectionTitle}>
            One employer profile, every role hangs off it
          </h2>
          <p className={styles.sectionSub}>
            Seekers judge the place before the posting. State the season, the
            crew, the housing and the meals once — every listing inherits that
            context instead of restating it, and your profile is the page a
            seeker lands on from any of your roles.
          </p>
          <Link className={styles.inlineLink} href="/for-hosts/demo/profile">
            See the demo profile
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
        <div className={styles.profileCard}>
          <div className={styles.profileCover} aria-hidden="true" />
          <div className={styles.profileBody}>
            <p className={styles.profileName}>{DEMO_ORG.name}</p>
            <p className={styles.profileMeta}>
              {DEMO_ORG.location} · Verified host · {DEMO_ORG.planName} plan
            </p>
            <ul className={styles.profileFacts}>
              {DEMO_ORG.facts.map((fact) => (
                <li key={fact.label}>
                  <span className={styles.profileFactLabel}>{fact.label}</span>
                  <span className={styles.profileFactValue}>{fact.value}</span>
                </li>
              ))}
            </ul>
            <span className={styles.demoTag}>{DEMO_ORG.demoLabel}</span>
          </div>
        </div>
      </section>

      {/* ── Discovery modes ───────────────────────────────────────── */}
      <section className={styles.flows} aria-labelledby="discovery-title">
        <div className={styles.sectionHead}>
          <h2 id="discovery-title" className={styles.sectionTitle}>
            Three ways seekers find you
          </h2>
          <p className={styles.sectionSub}>
            One published role appears in all three. They behave differently, so
            a listing that only works in one of them is a listing with a gap.
          </p>
        </div>
        <div className={styles.flowGrid}>
          {DISCOVERY_MODES.map((mode) => (
            <article key={mode.title} className={styles.flowCard}>
              <span className={styles.flowIcon} aria-hidden>
                <Icon name={mode.icon} size={24} />
              </span>
              <h3 className={styles.flowTitle}>{mode.title}</h3>
              <p className={styles.flowBody}>{mode.body}</p>
              <Link className={styles.inlineLink} href={mode.href}>
                Open {mode.title}
                <Icon name="action.forward" size={16} aria-hidden />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ── Matching ──────────────────────────────────────────────── */}
      <section className={styles.band} aria-labelledby="matching-title">
        <div className={styles.bandInner}>
          <h2 id="matching-title" className={styles.sectionTitle}>
            Matching you can explain to the person you hire
          </h2>
          <p className={styles.sectionSub}>
            A match score is built from what both sides actually stated:
            availability against your dates, the benefits a seeker needs against
            the housing, meals and pay you offer, and their stated preferences.
            It is computed once and stored with the application, so the number
            on the card is the number in your pipeline — and a boost never moves
            it, because a score you could buy would be worth nothing to either
            side.
          </p>
          <Link className={styles.inlineLink} href="/for-hosts/demo/job">
            See a scored role
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ── Workflow: applicants, messaging, announcements, boosts ── */}
      <section className={styles.flows} aria-labelledby="workflow-title">
        <div className={styles.sectionHead}>
          <h2 id="workflow-title" className={styles.sectionTitle}>
            What happens after they apply
          </h2>
        </div>
        <div className={styles.flowGrid}>
          {WORKFLOW.map((item) => (
            <article key={item.title} className={styles.flowCard}>
              <span className={styles.flowIcon} aria-hidden>
                <Icon name={item.icon} size={24} />
              </span>
              <h3 className={styles.flowTitle}>{item.title}</h3>
              <p className={styles.flowBody}>{item.body}</p>
              <Link className={styles.inlineLink} href={item.href}>
                {item.linkLabel}
                <Icon name="action.forward" size={16} aria-hidden />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ── Analytics preview ─────────────────────────────────────── */}
      <section className={styles.analytics} aria-labelledby="analytics-title">
        <div className={styles.sectionHead}>
          <h2 id="analytics-title" className={styles.sectionTitle}>
            Numbers that tell you what to change
          </h2>
          <p className={styles.sectionSub}>
            Views with no saves is a copy problem. Saves with no applications is
            a pay or housing problem. The dashboard separates the two.
          </p>
        </div>
        <DemoMetricTiles limit={4} />
        <Link className={styles.inlineLink} href="/for-hosts/demo/dashboard">
          Open the demo dashboard
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      </section>

      {/* ── Plans ─────────────────────────────────────────────────── */}
      <section id="plans" className={styles.pricing} aria-labelledby="plans-title">
        {/* Fired when the pricing band is actually scrolled into view, not on
            page load. On a page built to show the product before the price,
            "did they reach the price" is the question a page-view event cannot
            answer. */}
        <SectionViewed event={HOST_FUNNEL_EVENTS.hostPricingViewed} />
        <h2 id="plans-title" className={styles.sectionTitle}>
          Plans
        </h2>
        <p className={styles.pricingSub}>
          Building your profile and drafting roles costs nothing. A plan is what
          makes a role publishable. Annual billing is {ANNUAL_MONTHS_BILLED}{" "}
          monthly payments — two months free. Cancel any time.
        </p>

        <div className={styles.tierGrid}>
          {PAID_TIERS.map((tier) => (
            <article key={tier} className={styles.tier}>
              <h3 className={styles.tierName}>{tierName(tier)}</h3>
              <p className={styles.tierPrice}>
                <strong>{formatMoney(FOUNDER_LOCKED_PRICING[tier].monthly)}</strong>
                <span className={styles.tierPer}>/mo</span>
              </p>
              <p className={styles.tierAnnual}>
                or {formatMoney(FOUNDER_LOCKED_PRICING[tier].yearly)} a year
              </p>
              <ul className={styles.tierFeatures}>
                {planFeatures(tier).map((feature) => (
                  <li key={feature}>
                    <Icon name="system.success" size={16} aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link className={styles.tierCta} href="/host/plans">
                Choose {tierName(tier)}
              </Link>
            </article>
          ))}
        </div>
        <p className={styles.pricingFoot}>
          Add-ons sit on top of any plan, and every one of them is priced below.
        </p>
      </section>

      {/* ── Early-host programme ──────────────────────────────────── */}
      <div className={styles.foundingWrap}>
        <FoundingHostSection view={foundingView} />
      </div>

      {/* ── Add-ons ───────────────────────────────────────────────── */}
      <div className={styles.addonsWrap}>
        <AddOnTable />
      </div>

      {/* ── Comparison ────────────────────────────────────────────── */}
      <section className={styles.compare} aria-labelledby="compare-title">
        <div className={styles.sectionHead}>
          <h2 id="compare-title" className={styles.sectionTitle}>
            Traditional listing platform vs Explore &amp; Earn
          </h2>
          <p className={styles.sectionSub}>
            The left column describes the general job-board pattern. We name no
            company and quote no competitor&rsquo;s price.
          </p>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              Feature comparison between a traditional listing platform and
              Explore &amp; Earn
            </caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Traditional listing platform</th>
                <th scope="col">Explore &amp; Earn</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((entry) => (
                <tr key={entry.row}>
                  <th scope="row">{entry.row}</th>
                  <td>{entry.traditional}</td>
                  <td className={styles.oursCell}>{entry.ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className={styles.faq} aria-labelledby="faq-title">
        <h2 id="faq-title" className={styles.sectionTitle}>
          Questions hosts ask
        </h2>
        <div className={styles.faqList}>
          {FAQ.map((item) => (
            <details key={item.q} className={styles.faqItem}>
              <summary className={styles.faqQ}>{item.q}</summary>
              <p className={styles.faqA}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <section className={styles.finalCta}>
        <h2 className={styles.finalTitle}>Look before you pay</h2>
        <p className={styles.finalSub}>
          Walk the Enterprise workspace with sample data, then build your own
          profile and draft your first role. Nothing is charged until you
          publish.
        </p>
        <div className={styles.heroActions}>
          <Link className={styles.startBtnLg} href="/sign-up?role=host">
            <Icon name="nav.host" size={20} aria-hidden />
            Build your host profile
          </Link>
          <Link className={styles.ghostBtnDark} href="/for-hosts/demo">
            Explore the live demo
          </Link>
        </div>
      </section>
    </div>
  );
}
