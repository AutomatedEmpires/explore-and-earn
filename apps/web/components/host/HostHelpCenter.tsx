"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./HostHelpCenter.module.css";

/* ── Content model ─────────────────────────────────────────────────────
   Static, repo-owned help content — no DB dependency, so this never claims
   data the query layer doesn't expose. Answers are written for real hosts.
   ────────────────────────────────────────────────────────────────────── */

interface FaqItem {
  readonly q: string;
  /** Plain-text answer; rendered as one or more paragraphs split on "\n\n". */
  readonly a: string;
  /** Keywords that aren't already in q/a, to widen search matches. */
  readonly tags?: readonly string[];
}

interface FaqTopic {
  readonly id: string;
  readonly label: string;
  readonly icon: IconKey;
  readonly blurb: string;
  readonly items: readonly FaqItem[];
}

const TOPICS: readonly FaqTopic[] = [
  {
    id: "posting",
    label: "Posting & listings",
    icon: "category.mix",
    blurb: "Write, publish, and manage the opportunities seekers see.",
    items: [
      {
        q: "How do I publish my first listing?",
        a: "From Listings, choose New listing. Add a title, location, the Housing / Meals / Pay triad, and at least one photo. Save as a draft any time; when you select Publish it goes to a short review, then live to seekers.\n\nThe triad is required — seekers filter and rank on Housing, Meals, and Pay, so a complete triad ranks far above a partial one.",
        tags: ["create", "new", "draft", "publish"],
      },
      {
        q: "Why is my listing 'in review'?",
        a: "Every newly published listing gets a quick trust review before it reaches the public feed. It checks the triad is honest and the photos are real working-landscape shots. Most clear within a day. You'll see the status change to Live on the listing.",
        tags: ["pending", "approval", "status"],
      },
      {
        q: "Can I edit a listing after it's live?",
        a: "Yes. Open the listing and choose Edit. Small changes (description, photos, dates) take effect immediately. Material changes to pay or housing may re-enter review so seekers always see accurate terms.",
        tags: ["update", "change"],
      },
      {
        q: "How many photos should I add?",
        a: "Aim for five to eight: the working landscape, the housing a seeker would actually sleep in, a meal, and the people. Photos are framed, never filtered — show the real place. Listings with housing photos convert markedly better.",
        tags: ["images", "media", "gallery"],
      },
    ],
  },
  {
    id: "boosting",
    label: "Boosting & reach",
    icon: "status.boosted",
    blurb: "Get the right seekers to see your opportunity faster.",
    items: [
      {
        q: "What does boosting a listing do?",
        a: "A boost lifts your listing in the discovery feed and category lanes for its duration, so more matched seekers see it during your hiring window. It does not change who can apply — it changes how many of the right people notice in time.",
        tags: ["promote", "feature", "reach", "visibility"],
      },
      {
        q: "When is boosting worth it?",
        a: "Boost when you have a hard start date, a remote location, or a season that fills fast. A complete triad and strong housing photos make every boosted impression count more — fix those first, then boost.",
        tags: ["worth", "roi"],
      },
      {
        q: "Can I invite seekers directly instead?",
        a: "Yes — Invites lets you reach out to matched seekers directly. Your invite acceptance rate is tracked in Analytics, so you can see which roles and messages land.",
        tags: ["recruit", "outreach", "invite"],
      },
    ],
  },
  {
    id: "applicants",
    label: "Applicants & hiring",
    icon: "status.match",
    blurb: "Move people from applied to hired without losing anyone.",
    items: [
      {
        q: "How does the applicant pipeline work?",
        a: "Every applicant moves through stages: Applied → Reviewing → Saved → Offered → Accepted. Drag a card or use the status control to advance them. Your Analytics conversion score is the share who advance past first review — a healthy pool keeps moving.",
        tags: ["pipeline", "stages", "kanban"],
      },
      {
        q: "What's the fastest way to review applicants?",
        a: "Open Applicants for the pipeline board. Each card shows the seeker's fit at a glance; open one for the full résumé. Respond quickly — seekers with housing and start-date needs often hold multiple offers.",
        tags: ["screen", "resume", "review"],
      },
      {
        q: "How do I message an applicant?",
        a: "Open the applicant and choose Message, or go to Messages for all threads. Keeping the conversation on-platform protects both sides and keeps your response record intact.",
        tags: ["chat", "contact", "thread"],
      },
      {
        q: "What happens when I make an offer?",
        a: "Moving an applicant to Offered notifies the seeker. When they accept, the engagement becomes active — and after it completes they can leave a triad review confirming whether housing, meals, and pay matched what you promised.",
        tags: ["offer", "accept", "hire"],
      },
    ],
  },
  {
    id: "billing",
    label: "Plans & billing",
    icon: "analytics.meter",
    blurb: "Plans, boosts, invoices, and what each tier unlocks.",
    items: [
      {
        q: "What does each plan unlock?",
        a: "Starter and above unlock per-listing diagnosis in Analytics — application counts, invite rates, and acceptance data for each opportunity. Higher tiers raise active-listing limits and recruiting reach. See Settings for your current plan and what changing it would do.",
        tags: ["tier", "starter", "professional", "enterprise", "upgrade"],
      },
      {
        q: "How do I change or cancel my plan?",
        a: "Go to Settings, then Plan & billing. Changes are handled through our secure billing portal — you'll always see the new price before anything is charged, and downgrades keep your data.",
        tags: ["cancel", "downgrade", "subscription"],
      },
      {
        q: "Where are my invoices and receipts?",
        a: "Every charge has a receipt in the billing portal, reachable from Settings → Plan & billing. Invoices are emailed to your billing address as soon as a payment succeeds.",
        tags: ["receipt", "invoice", "payment"],
      },
    ],
  },
  {
    id: "trust",
    label: "Trust & reviews",
    icon: "trust.verified_host",
    blurb: "Become a Verified Host and earn an honest reputation.",
    items: [
      {
        q: "How do I become a Verified Host?",
        a: "Complete your host profile and attest to your Housing / Meals / Pay terms. Once attested, the Verified Host badge appears on your public page and listings — the single strongest trust signal a seeker sees.",
        tags: ["verify", "attest", "badge"],
      },
      {
        q: "Where do reviews come from?",
        a: "Reviews come only from seekers who actually worked with you — never anonymous drive-bys. Each one confirms whether housing, meals, and pay were as promised. That triad-kept record is something no ordinary job board can show.",
        tags: ["rating", "feedback"],
      },
      {
        q: "A review feels unfair — what can I do?",
        a: "Reviews are tied to real, completed engagements, so they can't be removed for being critical. You can respond from your profile, and you can report a review that breaks the guidelines. The most powerful answer is your next kept promise.",
        tags: ["dispute", "report", "remove"],
      },
    ],
  },
];

interface QuickLink {
  readonly href: string;
  readonly label: string;
  readonly sub: string;
  readonly icon: IconKey;
}

const QUICK_LINKS: readonly QuickLink[] = [
  { href: "/host/listings/new", label: "Post a listing", sub: "Start a new opportunity", icon: "category.mix" },
  { href: "/host/applicants", label: "Review applicants", sub: "Move your pipeline", icon: "status.match" },
  { href: "/host/analytics", label: "See performance", sub: "Counts & conversion", icon: "analytics.trend" },
  { href: "/host/settings", label: "Plan & billing", sub: "Manage your plan", icon: "system.info" },
];

function highlight(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const btnId = useId();
  return (
    <div className={`${styles.faq}${open ? ` ${styles.faqOpen}` : ""}`}>
      <button
        type="button"
        id={btnId}
        className={styles.faqQ}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.faqQText}>{item.q}</span>
        <span className={styles.faqChevron} aria-hidden>
          <Icon name="action.forward" size={16} aria-hidden />
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        className={styles.faqA}
        hidden={!open}
      >
        {item.a.split("\n\n").map((para, i) => (
          <p key={i} className={styles.faqPara}>
            {para}
          </p>
        ))}
      </div>
    </div>
  );
}

export function HostHelpCenter() {
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<string>("all");

  const filtered = useMemo(() => {
    return TOPICS.map((topic) => {
      const items = topic.items.filter((it) => {
        const hay = `${it.q} ${it.a} ${(it.tags ?? []).join(" ")} ${topic.label}`;
        return highlight(hay, query);
      });
      return { ...topic, items };
    }).filter(
      (topic) =>
        (activeTopic === "all" || topic.id === activeTopic) && topic.items.length > 0,
    );
  }, [query, activeTopic]);

  const totalMatches = filtered.reduce((n, t) => n + t.items.length, 0);
  const hasQuery = query.trim().length > 0;

  return (
    <div className={styles.root}>
      {/* ── Hero / search ─────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="help-title">
        <span className={styles.eyebrow}>
          <Icon name="nav.help" size={16} aria-hidden />
          Host support
        </span>
        <h1 id="help-title" className={styles.title}>
          How can we help you host well?
        </h1>
        <p className={styles.lede}>
          Answers to the questions hosts ask most — posting, boosting, applicants,
          billing, and the trust that sets Explore&amp;Earn apart.
        </p>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden>
            <Icon name="action.search" size={20} aria-hidden />
          </span>
          <input
            type="search"
            className={styles.search}
            placeholder="Search help — e.g. boost, invoice, verified…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search host help"
          />
          {hasQuery ? (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <Icon name="action.close" size={16} aria-hidden />
            </button>
          ) : null}
        </div>
      </section>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      {!hasQuery ? (
        <section className={styles.quick} aria-label="Quick actions">
          {QUICK_LINKS.map((q) => (
            <Link key={q.href} href={q.href} className={styles.quickCard}>
              <span className={styles.quickIcon} aria-hidden>
                <Icon name={q.icon} size={20} aria-hidden />
              </span>
              <span className={styles.quickBody}>
                <b>{q.label}</b>
                <s>{q.sub}</s>
              </span>
              <span className={styles.quickArrow} aria-hidden>
                <Icon name="action.forward" size={16} aria-hidden />
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      {/* ── Topic filter ──────────────────────────────────────────── */}
      <div className={styles.topicBar} role="tablist" aria-label="Help topics">
        <button
          type="button"
          role="tab"
          aria-selected={activeTopic === "all"}
          className={`${styles.topicChip}${activeTopic === "all" ? ` ${styles.topicChipOn}` : ""}`}
          onClick={() => setActiveTopic("all")}
        >
          All topics
        </button>
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTopic === t.id}
            className={`${styles.topicChip}${activeTopic === t.id ? ` ${styles.topicChipOn}` : ""}`}
            onClick={() => setActiveTopic(t.id)}
          >
            <Icon name={t.icon} size={16} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Results ───────────────────────────────────────────────── */}
      {hasQuery ? (
        <p className={styles.resultCount} aria-live="polite">
          {totalMatches === 0
            ? "No answers matched — try a different word."
            : `${totalMatches} ${totalMatches === 1 ? "answer" : "answers"} for “${query.trim()}”`}
        </p>
      ) : null}

      {filtered.length > 0 ? (
        <div className={styles.topics}>
          {filtered.map((topic) => (
            <section
              key={topic.id}
              className={styles.topic}
              aria-labelledby={`topic-${topic.id}`}
            >
              <div className={styles.topicHead}>
                <span className={styles.topicHeadIcon} aria-hidden>
                  <Icon name={topic.icon} size={20} aria-hidden />
                </span>
                <div>
                  <h2 id={`topic-${topic.id}`} className={styles.topicTitle}>
                    {topic.label}
                  </h2>
                  <p className={styles.topicBlurb}>{topic.blurb}</p>
                </div>
              </div>
              <div className={styles.faqList}>
                {topic.items.map((item) => (
                  <FaqRow key={item.q} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.noResults}>
          <span className={styles.noResultsIcon} aria-hidden>
            <Icon name="action.search" size={24} aria-hidden />
          </span>
          <p className={styles.noResultsTitle}>Nothing matched that search</p>
          <p className={styles.noResultsNote}>
            Try a simpler word, or browse a topic above.
          </p>
        </div>
      )}

      {/* ── Still need help ───────────────────────────────────────── */}
      <section className={styles.contact} aria-labelledby="contact-heading">
        <div className={styles.contactBody}>
          <h2 id="contact-heading" className={styles.contactTitle}>
            Still stuck?
          </h2>
          <p className={styles.contactNote}>
            We answer hosts directly. Send us the listing or applicant in question
            and we&apos;ll get back within one business day.
          </p>
        </div>
        <a className={styles.contactBtn} href="mailto:hosts@exploreandearn.com">
          <Icon name="action.message" size={16} aria-hidden />
          Email host support
        </a>
      </section>
    </div>
  );
}
