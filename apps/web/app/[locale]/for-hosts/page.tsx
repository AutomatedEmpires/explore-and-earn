import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { FOUNDER_LOCKED_PRICING } from "@explore-and-earn/contracts";
import { cloudinaryPhoto, Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Host on Explore & Earn — your command center",
  description:
    "See exactly what your host dashboard looks like before you sign up: post opportunities with Housing, Meals & Pay up front, add photos, boost for visibility, post announcements, and review applicants — all in one command center.",
  // Canonical guards the revenue-side acquisition page against UTM/query
  // variants indexing as duplicates (review 2026-07-22).
  alternates: { canonical: "/for-hosts" },
  openGraph: {
    title: "Host on Explore & Earn",
    description:
      "Preview the host command center — post opportunities, boost, announce, and hire seekers.",
    type: "website",
  },
};

/** The same scenic Cloudinary hero pattern the homepage uses — a real place, framed. */
const HERO_IMAGE = cloudinaryPhoto("seasonal", "vojtech-bruzek-yrxr3bspds0", "hero");

/** Representative figures for the labelled dashboard PREVIEW (clearly not live data). */
const PREVIEW_KPIS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "3", label: "Live listings" },
  { value: "24", label: "Applicants" },
  { value: "6", label: "Pending review" },
  { value: "82%", label: "Reviewed" },
];

const PREVIEW_STEPS: ReadonlyArray<{ label: string; done: boolean }> = [
  { label: "Set up your host profile", done: true },
  { label: "Post your first opportunity", done: true },
  { label: "Add photos & publish", done: false },
];

const FLOWS: ReadonlyArray<{ icon: IconKey; title: string; body: string }> = [
  {
    icon: "status.open",
    title: "Post an opportunity",
    body: "A guided form puts Housing, Meals & Pay up front — the three things seekers decide on. Pick your lane (farm, maritime, remote, seasonal) with plain-language help.",
  },
  {
    icon: "category.mix",
    title: "Add framed photos",
    body: "Drag-and-drop a cover shot and a gallery. We frame them on warm paper — no filters — so the work looks like the real place it is.",
  },
  {
    icon: "status.boosted",
    title: "Boost for visibility",
    body: "Push a listing to the top of discovery, the map, and swipe for 7, 14, or 28 days when you need to fill a role fast.",
  },
  {
    icon: "nav.announcements",
    title: "Post announcements",
    body: "Reach every seeker with a hiring push, an event, or an update — right from your dashboard, with a monthly allowance on paid plans.",
  },
  {
    icon: "status.match",
    title: "Review applicants",
    body: "A clean pipeline: new, in review, offered. Message applicants, send offers, and keep great seekers warm before someone else does.",
  },
  {
    icon: "trust.verified_host",
    title: "Build trust",
    body: "A verified-host badge and two-sided reviews show seekers you're the real deal — the reputation that fills roles season after season.",
  },
];

function priceLabel(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

const TIERS: ReadonlyArray<{
  name: string;
  monthly: number;
  blurb: string;
}> = [
  {
    name: "Starter",
    monthly: FOUNDER_LOCKED_PRICING.starter.monthly,
    blurb: "1 active listing, basic analytics.",
  },
  {
    name: "Professional",
    monthly: FOUNDER_LOCKED_PRICING.professional.monthly,
    blurb: "5 listings, invite credits, full analytics.",
  },
  {
    name: "Enterprise",
    monthly: FOUNDER_LOCKED_PRICING.enterprise.monthly,
    // "a team seat" removed — team membership is unbuilt (see pricing.ts).
    blurb: "10 listings, more credits, homepage placement.",
  },
];

export default function ForHostsPage() {
  return (
    <div className={styles.page}>

      {/* ── Hero — framed working landscape, homepage register ──── */}
      <section className={styles.hero} aria-labelledby="hosts-hero-title">
        <div className={styles.heroFrame}>
          <Image
            className={styles.heroImage}
            src={HERO_IMAGE}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="100vw"
          />
          <div className={styles.heroScrim} aria-hidden="true" />
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>For hosts</p>
            <h1 id="hosts-hero-title" className={styles.heroTitle}>Your hosting command center</h1>
            <p className={styles.heroSub}>
              Post seasonal work with Housing, Meals &amp; Pay up front, and reach
              seekers who are ready to go. Here&rsquo;s exactly what your dashboard
              looks like — before you sign up.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.startBtnLg} href="/host/onboarding">
                <Icon name="status.open" size={20} aria-hidden />
                Start hosting
              </Link>
              <a className={styles.ghostBtnLg} href="#preview">
                See the dashboard
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Dashboard preview (labelled) ────────────────────────── */}
      <section id="preview" className={styles.previewWrap} aria-label="Host dashboard preview">
        <div className={styles.previewFrame}>
          <span className={styles.previewTag}>Preview</span>
          <div className={styles.previewHead}>
            <div>
              <p className={styles.previewEyebrow}>Hosting command center</p>
              <h2 className={styles.previewTitle}>Welcome back, Wenatchee Orchard Co.</h2>
            </div>
            <span className={styles.previewCta}>Review 6 applicants</span>
          </div>
          <div className={styles.kpiRow}>
            {PREVIEW_KPIS.map((kpi) => (
              <div key={kpi.label} className={styles.kpi}>
                <span className={styles.kpiValue}>{kpi.value}</span>
                <span className={styles.kpiLabel}>{kpi.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.previewChecklist}>
            <span className={styles.previewChecklistTitle}>Get your first opportunity live</span>
            <ul>
              {PREVIEW_STEPS.map((step) => (
                <li key={step.label} className={step.done ? styles.stepDone : styles.stepTodo}>
                  <span className={styles.stepMark} aria-hidden>
                    {step.done ? <Icon name="system.success" size={16} /> : ""}
                  </span>
                  {step.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.previewNote}>
          A representative preview of the real dashboard — your live numbers,
          listings, and applicants appear once you start hosting.
        </p>
      </section>

      {/* ── Flow walkthrough ────────────────────────────────────── */}
      <section className={styles.flows}>
        <h2 className={styles.sectionTitle}>Everything you need, guided</h2>
        <div className={styles.flowGrid}>
          {FLOWS.map((flow) => (
            <article key={flow.title} className={styles.flowCard}>
              <span className={styles.flowIcon} aria-hidden>
                <Icon name={flow.icon} size={24} />
              </span>
              <h3 className={styles.flowTitle}>{flow.title}</h3>
              <p className={styles.flowBody}>{flow.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────── */}
      <section id="pricing" className={styles.pricing}>
        <h2 className={styles.sectionTitle}>Simple host plans</h2>
        <p className={styles.pricingSub}>Annual billing is two months free. Cancel anytime.</p>

        <div className={styles.tierGrid}>
          {TIERS.map((tier) => (
            <article key={tier.name} className={styles.tier}>
              <h3 className={styles.tierName}>{tier.name}</h3>
              <p className={styles.tierPrice}>
                <strong>{priceLabel(tier.monthly)}</strong>
                <span className={styles.tierPer}>/mo</span>
              </p>
              <p className={styles.tierBlurb}>{tier.blurb}</p>
              <Link className={styles.tierCta} href="/host/onboarding">
                Start hosting
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────── */}
      <section className={styles.finalCta}>
        <h2 className={styles.finalTitle}>Ready to fill your season?</h2>
        <p className={styles.finalSub}>
          Set up your host account in a minute — we&rsquo;ll walk you through your
          first listing step by step.
        </p>
        <Link className={styles.startBtnLg} href="/host/onboarding">
          <Icon name="status.open" size={20} aria-hidden />
          Start hosting
        </Link>
      </section>

    </div>
  );
}
