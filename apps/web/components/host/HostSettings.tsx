"use client";

import { useState } from "react";
import { Icon } from "@explore-and-earn/ui";

import styles from "./HostSettings.module.css";

const SUPPORT_EMAIL = "jackson@automatedempires.com";

export interface HostSettingsProps {
  readonly subscriptionTier: "none" | "starter" | "professional" | "enterprise";
  readonly companyName: string;
  readonly hostProfileId: string | null;
}

type SettingsTab = "billing" | "team" | "support" | "account";

/* ── Tier plan definitions ──────────────────────────────────────── */

interface TierPlan {
  readonly id: "none" | "starter" | "professional" | "enterprise";
  readonly name: string;
  readonly price: string;
  readonly period: string;
  readonly tagline: string;
  readonly features: readonly string[];
  readonly cta: string;
  readonly highlighted?: boolean;
}

const PLANS: readonly TierPlan[] = [
  {
    id: "none",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "Get started with one listing",
    features: [
      "1 active listing",
      "Basic analytics overview",
      "Application pipeline (30 days)",
      "Public host profile",
      "Direct applicant messaging",
    ],
    cta: "Current plan",
  },
  {
    id: "starter",
    name: "Starter",
    price: "$199",
    period: "per month",
    tagline: "For growing operations",
    features: [
      "3 active listings",
      "Full analytics + per-listing breakdown",
      "10 invite credits per month",
      "Custom tagline on profile",
      "Priority applicant view",
    ],
    cta: "Upgrade to Starter",
    highlighted: true,
  },
  {
    id: "professional",
    name: "Professional",
    price: "$399",
    period: "per month",
    tagline: "For established hosts",
    features: [
      "Unlimited active listings",
      "Advanced analytics + trends",
      "Unlimited invite credits",
      "Listing boost access",
      "Priority search placement",
      "Cover photo + gallery",
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$749",
    period: "per month",
    tagline: "Large operations & teams",
    features: [
      "Everything in Professional",
      "3 team member seats",
      "Dedicated account support",
      "Custom onboarding",
      "Early access to new features",
      "SLA guarantee",
    ],
    cta: "Contact sales",
  },
];

/* ── FAQ data ───────────────────────────────────────────────────── */

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "How do listing limits work?",
    answer:
      "Each active (live or paused) listing counts toward your plan limit. Archived and draft listings do not count. You can have unlimited drafts on any plan.",
  },
  {
    question: "What are invite credits?",
    answer:
      "Invite credits let you proactively invite seekers to apply to your listing. One credit = one invite sent. Credits reset monthly and do not roll over.",
  },
  {
    question: "Can I switch plans?",
    answer:
      "Yes. Upgrading takes effect immediately and is prorated. Downgrading takes effect at your next billing cycle. Contact support if you need help.",
  },
  {
    question: "What happens to my data if I cancel?",
    answer:
      "Your data is retained for 90 days after cancellation. After that, listings and applicant history are anonymized per our data retention policy.",
  },
  {
    question: "Do you offer seasonal or annual billing?",
    answer:
      "Annual billing with a 20% discount is coming soon. Reach out to be notified when it launches.",
  },
];

/* ── Sub-components ─────────────────────────────────────────────── */

function TabBar({
  active,
  onChange,
}: {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: "billing", label: "Plan & billing", icon: "analytics.meter" },
    { id: "team", label: "Team", icon: "status.match" },
    { id: "support", label: "Help & support", icon: "system.info" },
    { id: "account", label: "Account", icon: "nav.profile" },
  ];

  return (
    <div className={styles.tabBar} role="tablist" aria-label="Settings sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          className={active === tab.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => onChange(tab.id)}
        >
          <Icon name={tab.icon as "analytics.meter"} size={16} aria-hidden />
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  current,
}: {
  plan: TierPlan;
  current: boolean;
}) {
  return (
    <div
      className={`${styles.planCard}${plan.highlighted ? ` ${styles.planHighlighted}` : ""}${current ? ` ${styles.planCurrent}` : ""}`}
    >
      {plan.highlighted && !current ? (
        <div className={styles.planBadge}>Most popular</div>
      ) : null}
      {current ? <div className={styles.planBadge}>Your plan</div> : null}
      <div className={styles.planHead}>
        <p className={styles.planName}>{plan.name}</p>
        <div className={styles.planPriceRow}>
          <span className={styles.planPrice}>{plan.price}</span>
          <span className={styles.planPeriod}>{plan.period}</span>
        </div>
        <p className={styles.planTagline}>{plan.tagline}</p>
      </div>
      <ul className={styles.planFeatures} role="list">
        {plan.features.map((f) => (
          <li key={f} className={styles.planFeature}>
            <span className={styles.planCheck} aria-hidden>
              <Icon name="system.success" size={16} aria-hidden />
            </span>
            {f}
          </li>
        ))}
      </ul>
      <a
        className={`${styles.planCta}${current ? ` ${styles.planCtaCurrent}` : ""}`}
        href={`mailto:${SUPPORT_EMAIL}?subject=Explore%20%26%20Earn%20Plan%20Upgrade`}
        aria-label={`${plan.cta} — ${plan.name}`}
      >
        {plan.cta}
      </a>
    </div>
  );
}

function BillingPanel({ subscriptionTier }: { subscriptionTier: HostSettingsProps["subscriptionTier"] }) {
  return (
    <div className={styles.panel} id="panel-billing" role="tabpanel" aria-label="Plan & billing">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Plans</h2>
        <p className={styles.panelDesc}>
          Choose the plan that fits your operation. All plans include a public host profile and
          direct applicant messaging.
        </p>
      </div>
      <div className={styles.planGrid}>
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} current={subscriptionTier === plan.id} />
        ))}
      </div>
      <div className={styles.billingNote}>
        <Icon name="system.info" size={16} aria-hidden />
        <span>
          Billing is managed manually during early access. Reach out to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.inlineLink}>
            {SUPPORT_EMAIL}
          </a>{" "}
          to upgrade or discuss custom pricing.
        </span>
      </div>
    </div>
  );
}

function TeamPanel({ subscriptionTier, companyName }: { subscriptionTier: HostSettingsProps["subscriptionTier"]; companyName: string }) {
  const hasTeam = subscriptionTier === "enterprise";

  return (
    <div className={styles.panel} id="panel-team" role="tabpanel" aria-label="Team">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Team members</h2>
        <p className={styles.panelDesc}>
          Enterprise plan hosts can add up to 3 team members who can manage listings and view
          applicants under your account.
        </p>
      </div>

      {hasTeam ? (
        <div className={styles.teamSection}>
          <div className={styles.teamMember}>
            <div className={styles.teamAvatar}>
              <Icon name="nav.profile" size={20} aria-hidden />
            </div>
            <div className={styles.teamMemberInfo}>
              <span className={styles.teamMemberName}>{companyName}</span>
              <span className={styles.teamMemberRole}>Owner</span>
            </div>
            <span className={styles.teamOwnerBadge}>You</span>
          </div>
          <button type="button" className={styles.addMemberBtn} disabled>
            <Icon name="action.apply" size={16} aria-hidden />
            Invite team member
          </button>
          <p className={styles.teamNote}>
            Team member invitations are coming soon. You will be notified when this feature
            launches.
          </p>
        </div>
      ) : (
        <div className={styles.gateBlock}>
          <span className={styles.gateBlockIcon}>
            <Icon name="system.info" size={24} aria-hidden />
          </span>
          <p className={styles.gateBlockTitle}>Enterprise plan required</p>
          <p className={styles.gateBlockNote}>
            Add team members to your host account so your crew can manage listings and review
            applicants together.
          </p>
          <a
            className={styles.gateBlockBtn}
            href={`mailto:${SUPPORT_EMAIL}?subject=Enterprise%20Plan%20Inquiry`}
          >
            Contact sales
          </a>
        </div>
      )}
    </div>
  );
}

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const answerId = `faq-${item.question.slice(0, 24).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className={styles.faqItem}>
      <button
        type="button"
        className={styles.faqQuestion}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={answerId}
      >
        <span>{item.question}</span>
        <Icon name={open ? "action.close" : "action.forward"} size={16} aria-hidden />
      </button>
      {open ? <p className={styles.faqAnswer} id={answerId}>{item.answer}</p> : null}
    </div>
  );
}

function SupportPanel() {
  return (
    <div className={styles.panel} id="panel-support" role="tabpanel" aria-label="Help & support">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Help & support</h2>
        <p className={styles.panelDesc}>
          Find answers, reach the team, or browse guides for getting the most from your host
          dashboard.
        </p>
      </div>

      <div className={styles.supportGrid}>
        <a
          className={styles.supportCard}
          href={`mailto:${SUPPORT_EMAIL}?subject=Host%20Support%20Request`}
        >
          <span className={styles.supportIcon}>
            <Icon name="action.message" size={20} aria-hidden />
          </span>
          <span className={styles.supportCardLabel}>Email support</span>
          <span className={styles.supportCardDesc}>Hear back within 1–2 business days</span>
        </a>
        <a
          className={styles.supportCard}
          href={`mailto:${SUPPORT_EMAIL}?subject=Help%20Center%20Request`}
        >
          <span className={styles.supportIcon}>
            <Icon name="system.info" size={20} aria-hidden />
          </span>
          <span className={styles.supportCardLabel}>Help center</span>
          <span className={styles.supportCardDesc}>Coming soon — contact us for now</span>
        </a>
        <a
          className={styles.supportCard}
          href={`mailto:${SUPPORT_EMAIL}?subject=Community%20Request`}
        >
          <span className={styles.supportIcon}>
            <Icon name="nav.feed" size={20} aria-hidden />
          </span>
          <span className={styles.supportCardLabel}>Community</span>
          <span className={styles.supportCardDesc}>Coming soon — contact us for now</span>
        </a>
      </div>

      <div className={styles.faqSection}>
        <h3 className={styles.faqHeading}>Frequently asked questions</h3>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map((item) => (
            <FaqRow key={item.question} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AccountPanel({
  companyName,
  hostProfileId,
}: {
  companyName: string;
  hostProfileId: string | null;
}) {
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "sent">("idle");

  function handleDeleteRequest() {
    if (deleteStep === "idle") {
      setDeleteStep("confirm");
      return;
    }
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20host%20account%20(${encodeURIComponent(companyName || "unknown")}).%20I%20understand%20this%20is%20permanent%20and%20cannot%20be%20undone.`;
    setDeleteStep("sent");
  }

  return (
    <div className={styles.panel} id="panel-account" role="tabpanel" aria-label="Account">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Account</h2>
        <p className={styles.panelDesc}>
          Manage your host account settings. Some actions require contacting support.
        </p>
      </div>

      <div className={styles.accountSection}>
        <div className={styles.accountRow}>
          <div className={styles.accountRowInfo}>
            <span className={styles.accountRowLabel}>Organization</span>
            <span className={styles.accountRowValue}>{companyName || "—"}</span>
          </div>
          <a className={styles.accountRowAction} href="/host/profile/edit">
            Edit profile
          </a>
        </div>
        <div className={styles.accountRow}>
          <div className={styles.accountRowInfo}>
            <span className={styles.accountRowLabel}>Host profile ID</span>
            <span className={styles.accountRowValue}>
              {hostProfileId ? hostProfileId.slice(0, 8) + "…" : "—"}
            </span>
          </div>
        </div>
        <div className={styles.accountRow}>
          <div className={styles.accountRowInfo}>
            <span className={styles.accountRowLabel}>Password & security</span>
            <span className={styles.accountRowValue}>Managed via your sign-in provider</span>
          </div>
        </div>
      </div>

      <div className={styles.dangerZone}>
        <h3 className={styles.dangerTitle}>Danger zone</h3>
        {deleteStep === "idle" ? (
          <div className={styles.dangerRow}>
            <div>
              <p className={styles.dangerRowLabel}>Delete host account</p>
              <p className={styles.dangerRowNote}>
                Permanently removes your profile, listings, and applicant history. This cannot be
                undone.
              </p>
            </div>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={handleDeleteRequest}
            >
              Request deletion
            </button>
          </div>
        ) : deleteStep === "confirm" ? (
          <div className={styles.dangerConfirm}>
            <p className={styles.dangerConfirmText}>
              Are you sure? This will permanently delete{" "}
              <strong>{companyName || "your account"}</strong>, all listings, and all applicant
              history. This cannot be undone.
            </p>
            <div className={styles.dangerConfirmActions}>
              <button
                type="button"
                className={styles.dangerBtnConfirm}
                onClick={handleDeleteRequest}
              >
                Yes, send deletion request
              </button>
              <button
                type="button"
                className={styles.dangerBtnCancel}
                onClick={() => setDeleteStep("idle")}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.dangerSent}>
            <Icon name="system.success" size={20} aria-hidden />
            <p>
              Deletion request received. Our team will process it within 5 business days and
              confirm via email.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */

export function HostSettings({
  subscriptionTier,
  companyName,
  hostProfileId,
}: HostSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("billing");

  return (
    <div className={styles.root}>
      <TabBar active={activeTab} onChange={setActiveTab} />
      {activeTab === "billing" && <BillingPanel subscriptionTier={subscriptionTier} />}
      {activeTab === "team" && (
        <TeamPanel subscriptionTier={subscriptionTier} companyName={companyName} />
      )}
      {activeTab === "support" && <SupportPanel />}
      {activeTab === "account" && (
        <AccountPanel companyName={companyName} hostProfileId={hostProfileId} />
      )}
    </div>
  );
}
