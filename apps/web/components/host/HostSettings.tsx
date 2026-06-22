"use client";

import { useState } from "react";
import { Icon } from "@explore-and-earn/ui";
import {
  ADDON_PRICING,
  ANNUAL_MONTHS_BILLED,
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";

import {
  startHostCheckoutAction,
  startHostBillingPortalAction,
} from "../../app/actions/hostBilling";
import styles from "./HostSettings.module.css";

const SUPPORT_EMAIL = "jackson@automatedempires.com";

export interface HostSettingsProps {
  readonly subscriptionTier: "none" | "starter" | "professional" | "enterprise";
  readonly companyName: string;
  readonly hostProfileId: string | null;
}

type SettingsTab = "billing" | "team" | "support" | "account";

/* ── Paid tiers (rendered from the founder-locked pricing contract) ──────
 * There is NO free tier. Names + taglines are presentation; every number — price
 * AND entitlement — is read from @explore-and-earn/contracts so this surface can
 * never drift from canonical pricing (the prior hardcoded plan list did, inventing
 * a free tier, "3 starter listings", "unlimited pro listings", etc.). */

type PaidTier = "starter" | "professional" | "enterprise";
type BillingInterval = "monthly" | "yearly";
const PAID_TIERS: readonly PaidTier[] = ["starter", "professional", "enterprise"];

const TIER_META: Record<
  PaidTier,
  { name: string; tagline: string; highlighted: boolean; cta: string }
> = {
  starter: {
    name: "Starter",
    tagline: "Get your first crew in the door",
    highlighted: false,
    cta: "Choose Starter",
  },
  professional: {
    name: "Professional",
    tagline: "For established, growing operations",
    highlighted: true,
    cta: "Choose Professional",
  },
  enterprise: {
    name: "Enterprise",
    tagline: "Large, multi-site teams",
    highlighted: false,
    cta: "Choose Enterprise",
  },
};

/** Whole-dollar USD from integer cents (the contract stores cents everywhere). */
function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** Human feature list derived entirely from the locked plan entitlements. */
function planFeatures(tier: PaidTier): string[] {
  const e = PLAN_ENTITLEMENTS[tier];
  const features: (string | null)[] = [
    `${e.listings} active listing${e.listings === 1 ? "" : "s"}`,
    e.analytics === "full"
      ? "Full analytics + per-listing breakdown"
      : "Basic analytics overview",
    e.monthlyAnnouncements > 0
      ? `${e.monthlyAnnouncements} community announcement${e.monthlyAnnouncements === 1 ? "" : "s"} / month`
      : null,
    e.includedInviteCredits > 0
      ? `${e.includedInviteCredits} invite credits / month`
      : null,
    e.teamSeats > 0
      ? `${e.teamSeats} team seat${e.teamSeats === 1 ? "" : "s"} included`
      : null,
    "Public host profile",
    "Direct applicant messaging",
  ];
  return features.filter((f): f is string => Boolean(f));
}

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
    question: "Do you offer annual billing?",
    answer:
      "Yes — annual plans bill 10 months for 12, so you get two months free versus paying monthly. Reach out to switch to annual.",
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
  tier,
  current,
  interval,
}: {
  tier: PaidTier;
  current: boolean;
  interval: BillingInterval;
}) {
  const meta = TIER_META[tier];
  const annual = interval === "yearly";
  const price = usd(
    annual ? FOUNDER_LOCKED_PRICING[tier].yearly : FOUNDER_LOCKED_PRICING[tier].monthly,
  );
  const features = planFeatures(tier);

  return (
    <div
      className={`${styles.planCard}${meta.highlighted ? ` ${styles.planHighlighted}` : ""}${current ? ` ${styles.planCurrent}` : ""}`}
    >
      {meta.highlighted && !current ? (
        <div className={styles.planBadge}>Most popular</div>
      ) : null}
      {current ? <div className={styles.planBadge}>Your plan</div> : null}
      <div className={styles.planHead}>
        <p className={styles.planName}>{meta.name}</p>
        <div className={styles.planPriceRow}>
          <span className={styles.planPrice}>{price}</span>
          <span className={styles.planPeriod}>{annual ? "per year" : "per month"}</span>
        </div>
        {annual ? (
          <span className={styles.planSaveNote}>
            {12 - ANNUAL_MONTHS_BILLED} months free vs monthly
          </span>
        ) : null}
        <p className={styles.planTagline}>{meta.tagline}</p>
      </div>
      <ul className={styles.planFeatures} role="list">
        {features.map((f) => (
          <li key={f} className={styles.planFeature}>
            <span className={styles.planCheck} aria-hidden>
              <Icon name="system.success" size={16} aria-hidden />
            </span>
            {f}
          </li>
        ))}
      </ul>
      {current ? (
        <form action={startHostBillingPortalAction} className={styles.ctaForm}>
          <button type="submit" className={`${styles.planCta} ${styles.planCtaManage}`}>
            Manage billing
          </button>
        </form>
      ) : (
        <form action={startHostCheckoutAction} className={styles.ctaForm}>
          <input type="hidden" name="tier" value={tier} />
          <input type="hidden" name="interval" value={interval} />
          <button type="submit" className={styles.planCta} aria-label={meta.cta}>
            {meta.cta}
          </button>
        </form>
      )}
    </div>
  );
}

/* ── Add-ons (rendered from the locked add-on pricing) ──────────────────── */

function AddOnsSection({
  subscriptionTier,
}: {
  subscriptionTier: HostSettingsProps["subscriptionTier"];
}) {
  const addl = ADDON_PRICING.additionalListingMonthly;
  const ann = ADDON_PRICING.additionalAnnouncement;
  const boost = ADDON_PRICING.boost;

  const listingPrice =
    subscriptionTier === "none"
      ? `from ${usd(addl.enterprise)}/mo`
      : `${usd(addl[subscriptionTier])}/mo`;
  const listingDesc =
    subscriptionTier === "none"
      ? `Add an active listing beyond your plan's included count. Priced by tier — ${usd(addl.starter)} Starter · ${usd(addl.professional)} Pro · ${usd(addl.enterprise)} Enterprise, each per month.`
      : "Add an active listing beyond your plan's included count, billed monthly per extra active listing.";

  const addons: { name: string; price: string; desc: string }[] = [
    { name: "Additional active listing", price: `${listingPrice} each`, desc: listingDesc },
    {
      name: "Extra community announcement",
      price: `${usd(ann.priceCents)} each`,
      desc: `A single ${ann.runDays}-day announcement run beyond your plan's monthly allowance.`,
    },
    {
      name: "Listing boost",
      price: `${usd(boost.d7)}–${usd(boost.d28)}`,
      desc: `Temporary exposure boost — ${usd(boost.d7)} / 7 days, ${usd(boost.d14)} / 14 days, ${usd(boost.d28)} / 28 days. Visibility only; never changes match score.`,
    },
  ];

  return (
    <div className={styles.addonSection}>
      <h3 className={styles.addonHeading}>Add-ons</h3>
      <p className={styles.addonIntro}>
        Top up any plan as you grow — purchased à la carte, never bundled.
      </p>
      <div className={styles.addonGrid}>
        {addons.map((a) => (
          <div key={a.name} className={styles.addonCard}>
            <div className={styles.addonCardHead}>
              <span className={styles.addonName}>{a.name}</span>
              <span className={styles.addonPrice}>{a.price}</span>
            </div>
            <p className={styles.addonDesc}>{a.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingPanel({ subscriptionTier }: { subscriptionTier: HostSettingsProps["subscriptionTier"] }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <div className={styles.panel} id="panel-billing" role="tabpanel" aria-label="Plan & billing">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Plans</h2>
        <p className={styles.panelDesc}>
          Choose the plan that fits your operation. Every plan includes a public host profile and
          direct applicant messaging.
        </p>
      </div>

      <div className={styles.intervalToggle} role="group" aria-label="Billing interval">
        <button
          type="button"
          className={interval === "monthly" ? `${styles.intervalOption} ${styles.intervalActive}` : styles.intervalOption}
          aria-pressed={interval === "monthly"}
          onClick={() => setInterval("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={interval === "yearly" ? `${styles.intervalOption} ${styles.intervalActive}` : styles.intervalOption}
          aria-pressed={interval === "yearly"}
          onClick={() => setInterval("yearly")}
        >
          Annual
          <span className={styles.intervalBadge}>{12 - ANNUAL_MONTHS_BILLED} mo free</span>
        </button>
      </div>

      <div className={styles.planGrid}>
        {PAID_TIERS.map((tier) => (
          <PlanCard
            key={tier}
            tier={tier}
            current={subscriptionTier === tier}
            interval={interval}
          />
        ))}
      </div>

      <AddOnsSection subscriptionTier={subscriptionTier} />

      <div className={styles.billingNote}>
        <Icon name="system.info" size={16} aria-hidden />
        <span>
          Plans are billed securely through Stripe — choose a plan above, or use
          Manage billing to update payment details, switch plans, or cancel. For
          add-on capacity, contact{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.inlineLink}>
            {SUPPORT_EMAIL}
          </a>
          .
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
          Enterprise plans include a team seat so a crew member can manage listings and review
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
