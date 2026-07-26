"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";
import {
  ADDITIONAL_LISTING_PRICING,
  ADDON_PRICING,
  ANNUAL_MONTHS_BILLED,
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";
// TYPE-ONLY. @explore-and-earn/db's entry point pulls in modules that import
// "server-only", which cannot be bundled into a client component — so the
// VALUES this panel needs (the invitable role list, the effective listing cap)
// are computed by the server page and arrive as props. `import type` is erased
// at compile time and never becomes a runtime import.
import type { TeamMember, TeamSeatUsage } from "@explore-and-earn/db";

import { requestAccountDeletionAction } from "../../app/actions/accountDeletion";
import {
  startHostCheckoutAction,
  startHostBillingPortalAction,
} from "../../app/actions/hostBilling";
import {
  inviteTeamMemberAction,
  revokeTeamMemberAction,
} from "../../app/actions/hostTeam";
import { createAdditionalListingCheckoutAction } from "../../app/actions/listingSlots";
import styles from "./HostSettings.module.css";

const SUPPORT_EMAIL = "jackson@automatedempires.com";

export interface HostSettingsProps {
  readonly subscriptionTier: "none" | "starter" | "professional" | "enterprise";
  readonly companyName: string;
  readonly hostProfileId: string | null;
  /** Pending + active team members, resolved server-side. */
  readonly teamMembers: readonly TeamMember[];
  /** Seat limit / used / remaining for this host's tier. */
  readonly teamSeats: TeamSeatUsage;
  /** False when migration 085 has not reached this environment. */
  readonly teamAvailable: boolean;
  /** Roles a colleague may be invited as (INVITABLE_TEAM_ROLES, server-resolved). */
  readonly invitableRoles: readonly string[];
  /** Additional-listing add-on slots this host has paid for. */
  readonly purchasedListingSlots: number;
  /** Listings the host's PLAN includes — 0 with no subscription (no free tier). */
  readonly includedListingCap: number;
  /** Included listings + purchased slots — what the server will actually enforce. */
  readonly effectiveListingCap: number;
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
  // Widened from the `as const` literal so the singular/plural test stays a
  // runtime branch. Every tier is 0 today (see TEAM_SEATS_BY_TIER), which would
  // otherwise make `=== 1` a compile error instead of a false condition.
  const teamSeats: number = e.teamSeats;
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
    // Seats are listed only where the plan actually grants one — a zero must not
    // render as a sold feature. Every tier is 0 today because accepting a team
    // invitation grants no access; see TEAM_SEATS_BY_TIER.
    teamSeats > 0 ? `${teamSeats} team seat${teamSeats === 1 ? "" : "s"}` : null,
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

/**
 * The additional-listing add-on — a real purchase, not a price list.
 *
 * This card previously quoted three tier prices with no checkout, no Stripe
 * price, and no per-host allowance column, so the number on screen could not be
 * honoured even manually. It now starts a Stripe Checkout; the allowance is
 * credited by the webhook and counted by the publication cap.
 *
 * IT IS NOT SOLD TO AN UNSUBSCRIBED HOST. There is no free tier, so a host with
 * no plan has no included listing count to buy "beyond" and no tier to be priced
 * by. The card shows the three rates and points at the plans instead — quoting
 * them the Starter rate is how the settings page came to offer the Starter
 * allowance without the Starter subscription. The server refuses the same
 * request (actions/listingSlots.ts returns no_subscription), so this is
 * presentation, not the gate.
 */
function AdditionalListingCard({
  subscriptionTier,
  purchasedListingSlots,
  included,
  cap,
}: {
  subscriptionTier: HostSettingsProps["subscriptionTier"];
  purchasedListingSlots: number;
  included: number;
  cap: number;
}) {
  const [state, setState] = useState<"idle" | "starting" | "error">("idle");
  const unitPrice =
    subscriptionTier === "none" ? null : ADDITIONAL_LISTING_PRICING[subscriptionTier];

  function handleBuy() {
    setState("starting");
    void createAdditionalListingCheckoutAction(1)
      .then((result) => {
        if (result.ok) {
          window.location.assign(result.sessionUrl);
          return;
        }
        setState("error");
      })
      .catch(() => setState("error"));
  }

  return (
    <div className={styles.addonCard}>
      <div className={styles.addonCardHead}>
        <span className={styles.addonName}>Additional active listing</span>
        <span className={styles.addonPrice}>
          {unitPrice === null ? "With a plan" : `${usd(unitPrice)}/mo each`}
        </span>
      </div>
      <p className={styles.addonDesc}>
        One more active listing beyond your plan&rsquo;s included count, billed monthly.
        Priced by tier — {usd(ADDITIONAL_LISTING_PRICING.starter)} Starter ·{" "}
        {usd(ADDITIONAL_LISTING_PRICING.professional)} Pro ·{" "}
        {usd(ADDITIONAL_LISTING_PRICING.enterprise)} Enterprise.
      </p>
      {unitPrice === null ? (
        <p className={styles.addonDesc}>
          Extra listings are an add-on to a paid plan, so there&rsquo;s nothing to add
          on to yet. Choose a plan above and this unlocks at that plan&rsquo;s rate.
        </p>
      ) : (
        <p className={styles.addonDesc}>
          Your plan includes {included}. You have bought {purchasedListingSlots}, so you
          can hold {cap} active {cap === 1 ? "listing" : "listings"} at once.
        </p>
      )}
      {unitPrice === null ? null : (
        <button
          type="button"
          className={styles.planCta}
          onClick={handleBuy}
          disabled={state === "starting"}
        >
          {state === "starting" ? "Opening checkout…" : "Add one listing"}
        </button>
      )}
      {state === "error" ? (
        <p className={styles.addonDesc}>
          We couldn&rsquo;t start checkout just now. Try again, or email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Additional%20listing`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

function AddOnsSection({
  subscriptionTier,
  purchasedListingSlots,
  includedListingCap,
  effectiveListingCap,
}: {
  subscriptionTier: HostSettingsProps["subscriptionTier"];
  purchasedListingSlots: number;
  includedListingCap: number;
  effectiveListingCap: number;
}) {
  const ann = ADDON_PRICING.additionalAnnouncement;
  const boost = ADDON_PRICING.boost;

  const addons: { name: string; price: string; desc: string }[] = [
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
        <AdditionalListingCard
          subscriptionTier={subscriptionTier}
          purchasedListingSlots={purchasedListingSlots}
          included={includedListingCap}
          cap={effectiveListingCap}
        />
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

function BillingPanel({
  subscriptionTier,
  purchasedListingSlots,
  includedListingCap,
  effectiveListingCap,
}: {
  subscriptionTier: HostSettingsProps["subscriptionTier"];
  purchasedListingSlots: number;
  includedListingCap: number;
  effectiveListingCap: number;
}) {
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

      <AddOnsSection
        subscriptionTier={subscriptionTier}
        purchasedListingSlots={purchasedListingSlots}
        includedListingCap={includedListingCap}
        effectiveListingCap={effectiveListingCap}
      />

      <div className={styles.billingNote}>
        <Icon name="system.info" size={16} aria-hidden />
        <span>
          Plans are billed securely through Stripe — choose a plan above, or use
          Manage billing to update payment details, switch plans, or cancel. To
          cancel an add-on, use Manage billing. Anything else, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.inlineLink}>
            {SUPPORT_EMAIL}
          </a>
          .
        </span>
      </div>
    </div>
  );
}

const TEAM_ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  hiring_manager: "Hiring manager",
  analyst: "Analyst",
  billing: "Billing",
  viewer: "Viewer",
  owner: "Owner",
};

const TEAM_INVITE_ERROR: Record<string, string> = {
  invalid_email: "That doesn't look like an email address.",
  invalid_role: "Pick a role from the list.",
  seat_limit_reached:
    "Every seat on your plan is taken. Remove someone to free a seat, or upgrade.",
  already_invited: "There's already a pending invitation for that address.",
  unavailable: "Team seats aren't switched on for this environment yet.",
  rate_limited: "Too many invitations in the last hour. Try again shortly.",
  not_host: "We couldn't find your host profile.",
  unauthenticated: "Sign in again to invite a colleague.",
  failed: "We couldn't create that invitation.",
};

/**
 * Team members.
 *
 * NO PLAN GRANTS A SEAT TODAY (TEAM_SEATS_BY_TIER is 0 for every tier), so this
 * panel shows the owner and says plainly that nobody else can be added. The
 * reason is not a missing number: accepting an invitation grants no access to
 * listings, applicants, messages or analytics, because no policy admits a team
 * membership to any of them. Until it does, a card offering seats would sell
 * something acceptance does not deliver.
 *
 * The invite form below is therefore unreachable — seats.remaining is always 0 —
 * and it is kept, rather than deleted, because the plumbing behind it is real
 * and tested; it becomes reachable the moment a seat count can honestly rise.
 * The refusal that matters is server-side either way: the seat limit passed to
 * migration 085's SQL function is resolved from the host's real tier, so it is
 * zero even if this component is bypassed.
 *
 * DELIVERY IS EXPLICIT. Accepting the invitation needs the link below; nothing
 * here emails it, and nothing here says it did.
 */
function TeamPanel({
  companyName,
  members,
  seats,
  available,
  invitableRoles,
}: {
  companyName: string;
  members: readonly TeamMember[];
  seats: TeamSeatUsage;
  available: boolean;
  invitableRoles: readonly string[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const canInvite = available && seats.remaining > 0;

  function handleInvite() {
    setBusy(true);
    setError(null);
    setInviteLink(null);
    void inviteTeamMemberAction(email, role)
      .then((result) => {
        if (result.ok) {
          setInviteLink(result.acceptUrl);
          setEmail("");
          return;
        }
        setError(TEAM_INVITE_ERROR[result.reason] ?? TEAM_INVITE_ERROR.failed);
      })
      .catch(() => setError(TEAM_INVITE_ERROR.failed))
      .finally(() => setBusy(false));
  }

  function handleRemove(membershipId: string) {
    setBusy(true);
    setError(null);
    void revokeTeamMemberAction(membershipId)
      .then((result) => {
        if (!result.ok) setError("We couldn't remove that person.");
      })
      .catch(() => setError("We couldn't remove that person."))
      .finally(() => setBusy(false));
  }

  return (
    <div className={styles.panel} id="panel-team" role="tabpanel" aria-label="Team">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Team members</h2>
        <p className={styles.panelDesc}>
          {seats.limit === 0
            ? "Team accounts aren't available yet — no plan includes a seat, so the account owner is the only person who can sign in."
            : `Your plan includes ${seats.limit} team seat${seats.limit === 1 ? "" : "s"} alongside the owner — ${seats.used} in use, ${seats.remaining} free.`}
        </p>
      </div>

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

        {members.map((member) => (
          <div key={member.id} className={styles.teamMember}>
            <div className={styles.teamAvatar}>
              <Icon name="nav.profile" size={20} aria-hidden />
            </div>
            <div className={styles.teamMemberInfo}>
              <span className={styles.teamMemberName}>
                {member.invitedEmail ?? "Team member"}
              </span>
              <span className={styles.teamMemberRole}>
                {TEAM_ROLE_LABEL[member.rolePreset] ?? member.rolePreset}
                {member.status === "invited" ? " · invitation pending" : ""}
              </span>
            </div>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => handleRemove(member.id)}
              disabled={busy}
            >
              {member.status === "invited" ? "Withdraw" : "Remove"}
            </button>
          </div>
        ))}

        {!available ? (
          <p className={styles.teamNote}>
            Team seats aren&rsquo;t switched on for this environment yet, so nothing can be
            invited from here. Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Host%20account%20access`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            if you need a colleague added in the meantime.
          </p>
        ) : canInvite ? (
          <div className={styles.teamNote}>
            <label htmlFor="team-invite-email">Invite a colleague by email</label>
            <input
              id="team-invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="colleague@example.com"
            />
            <label htmlFor="team-invite-role">Role</label>
            <select
              id="team-invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {invitableRoles.map((r) => (
                <option key={r} value={r}>
                  {TEAM_ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.planCta}
              onClick={handleInvite}
              disabled={busy || email.trim().length === 0}
            >
              {busy ? "Creating invitation…" : "Create invitation"}
            </button>
          </div>
        ) : seats.limit > 0 ? (
          <p className={styles.teamNote}>
            Every seat on your plan is in use. Remove someone above to free a seat.
          </p>
        ) : (
          <p className={styles.teamNote}>
            No plan includes a team seat right now, and upgrading won&rsquo;t add
            one. If you need a colleague to help manage listings or review
            applicants, email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Host%20account%20access`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            and we&rsquo;ll work it out with you directly.
          </p>
        )}

        {error ? <p className={styles.teamNote}>{error}</p> : null}

        {inviteLink ? (
          <p className={styles.teamNote}>
            Invitation created. We have <strong>not</strong> emailed it — send this
            single-use link to your colleague yourself. They will need to sign in to
            accept it.
            <br />
            <code>{inviteLink}</code>
          </p>
        ) : null}
      </div>
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
        <Link className={styles.supportCard} href="/host/help">
          <span className={styles.supportIcon}>
            <Icon name="system.info" size={20} aria-hidden />
          </span>
          <span className={styles.supportCardLabel}>Help center</span>
          <span className={styles.supportCardDesc}>Guides, answers, and FAQs</span>
        </Link>
        <a
          className={styles.supportCard}
          href={`mailto:${SUPPORT_EMAIL}?subject=Community%20Announcement`}
        >
          <span className={styles.supportIcon}>
            <Icon name="nav.feed" size={20} aria-hidden />
          </span>
          <span className={styles.supportCardLabel}>Community</span>
          <span className={styles.supportCardDesc}>Announce to seekers — ask us to feature you</span>
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
  const [deleteStep, setDeleteStep] = useState<
    "idle" | "confirm" | "saving" | "sent" | "error"
  >("idle");

  /**
   * This used to open a `mailto:` and then declare "Deletion request received"
   * unconditionally. A person with no configured mail client — or who simply
   * closed the compose window — was told their request had been received when
   * nobody had received anything, and no record existed to measure a statutory
   * erasure deadline against. The request is now RECORDED server-side first,
   * and the confirmation only appears if that succeeded.
   */
  function handleDeleteRequest() {
    if (deleteStep === "idle") {
      setDeleteStep("confirm");
      return;
    }
    setDeleteStep("saving");
    void requestAccountDeletionAction("host", companyName || undefined)
      .then((result) => {
        // alreadyOpen is success: we hold their request either way.
        setDeleteStep(result.ok ? "sent" : "error");
      })
      .catch(() => setDeleteStep("error"));
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
              {/* "saving" renders its own branch below, so this button is
                  never on screen mid-request — no disabled state needed. */}
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
        ) : deleteStep === "saving" ? (
          <div className={styles.dangerSent}>
            <p>Sending your request…</p>
          </div>
        ) : deleteStep === "error" ? (
          // Never claim receipt we cannot evidence. A failed write must send
          // the person somewhere that actually reaches a human.
          <div className={styles.dangerSent}>
            <Icon name="system.warning" size={20} aria-hidden />
            <p>
              We couldn&apos;t record your request just now. Please try again, or email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Account%20Deletion%20Request`}>
                {SUPPORT_EMAIL}
              </a>{" "}
              so we have it on record.
            </p>
          </div>
        ) : (
          <div className={styles.dangerSent}>
            <Icon name="system.success" size={20} aria-hidden />
            <p>
              Deletion request received and logged. We&apos;ll review it and confirm by email.
              Your listings stay live until it&apos;s actioned — email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Account%20Deletion%20Request`}>
                {SUPPORT_EMAIL}
              </a>{" "}
              if you need it handled urgently.
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
  teamMembers,
  teamSeats,
  teamAvailable,
  invitableRoles,
  purchasedListingSlots,
  includedListingCap,
  effectiveListingCap,
}: HostSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("billing");

  return (
    <div className={styles.root}>
      <TabBar active={activeTab} onChange={setActiveTab} />
      {activeTab === "billing" && (
        <BillingPanel
          subscriptionTier={subscriptionTier}
          purchasedListingSlots={purchasedListingSlots}
          includedListingCap={includedListingCap}
          effectiveListingCap={effectiveListingCap}
        />
      )}
      {activeTab === "team" && (
        <TeamPanel
          companyName={companyName}
          members={teamMembers}
          seats={teamSeats}
          available={teamAvailable}
          invitableRoles={invitableRoles}
        />
      )}
      {activeTab === "support" && <SupportPanel />}
      {activeTab === "account" && (
        <AccountPanel companyName={companyName} hostProfileId={hostProfileId} />
      )}
    </div>
  );
}
