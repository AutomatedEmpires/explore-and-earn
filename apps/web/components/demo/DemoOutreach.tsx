import { INVITE_CREDIT_PACKS, PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";
import { Icon } from "@explore-and-earn/ui";

import { formatMoney } from "../../lib/format";
import {
  DEMO_ANALYTICS_LABEL,
  DEMO_CAMPAIGNS,
  DEMO_ORG,
  demoRole,
  outreachTotals,
} from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * Outreach: campaigns, credit usage, and response performance.
 *
 * The acceptance rate on every row is `accepted / sent` for THAT campaign,
 * computed here from the campaign record — there is no stored rate to drift
 * away from the two counts beside it. The account-level rate is the same fold
 * over all five campaigns, which is why the analytics dashboard's invite
 * acceptance and this page cannot disagree.
 *
 * The allowance and the pack prices are read from the pricing contract, never
 * typed here: a demo that quotes its own allowance is free to quote one the
 * plan does not grant.
 */
export function DemoOutreachWorkspace({ id }: { readonly id?: string }) {
  const totals = outreachTotals();
  const entitlement = PLAN_ENTITLEMENTS[DEMO_ORG.planTier];
  const pack = INVITE_CREDIT_PACKS[0];

  return (
    <div id={id}>
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Invite credits</h2>
            <p className={styles.panelNote}>
              The {DEMO_ORG.planName} plan includes{" "}
              {entitlement.includedInviteCredits} invites a month. This season
              has used {totals.sent} across {DEMO_CAMPAIGNS.length} campaigns,
              with {totals.sentThisPeriod} of them in the current period.
            </p>
          </div>
          <DemoLabel text={DEMO_ANALYTICS_LABEL} />
        </div>
        <ul className={styles.usageList}>
          <li className={styles.usageRow}>
            <span className={styles.usageTop}>
              <span>Used this period</span>
              <span className={styles.usageCount}>
                {totals.sentThisPeriod} of {entitlement.includedInviteCredits}
              </span>
            </span>
            <span
              className={styles.track}
              role="img"
              aria-label={`Invite credits: ${totals.sentThisPeriod} of ${entitlement.includedInviteCredits} used`}
            >
              <span
                className={styles.trackFill}
                style={
                  {
                    "--fill": `${Math.min(100, Math.round((totals.sentThisPeriod / Math.max(1, entitlement.includedInviteCredits)) * 100))}%`,
                  } as React.CSSProperties
                }
              />
            </span>
            <span className={styles.usageNote}>
              Past the monthly allowance, a pack of {pack.credits} credits is{" "}
              {formatMoney(pack.priceCents)} and does not expire monthly.
            </span>
          </li>
        </ul>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Response performance</h2>
            <p className={styles.panelNote}>
              {totals.accepted} of {totals.sent} invitations accepted —{" "}
              {Math.round(totals.acceptanceRate * 100)}% across the season. Each
              row below computes its own rate from its own two counts.
            </p>
          </div>
          <DemoLabel text={DEMO_ANALYTICS_LABEL} />
        </div>

        <ul className={styles.campaignList}>
          {DEMO_CAMPAIGNS.map((campaign) => {
            const role = demoRole(campaign.roleId);
            const rate =
              campaign.invitesSent === 0
                ? 0
                : campaign.invitesAccepted / campaign.invitesSent;
            return (
              <li key={campaign.id} className={styles.campaign}>
                <div className={styles.campaignTop}>
                  <h3 className={styles.campaignName}>{campaign.name}</h3>
                  <span className={styles.rolePill}>
                    <Icon name="status.open" size={12} aria-hidden />
                    {campaign.status === "running" ? "Running" : "Complete"}
                  </span>
                </div>
                <p className={styles.panelNote}>
                  For {role.title} · started {campaign.startedOn} ·{" "}
                  {campaign.audience}
                </p>
                <div className={styles.roleStats}>
                  <div className={styles.roleStat}>
                    <span className={styles.roleStatLabel}>Invitations</span>
                    <span className={styles.roleStatValue}>
                      {campaign.invitesSent}
                    </span>
                  </div>
                  <div className={styles.roleStat}>
                    <span className={styles.roleStatLabel}>Accepted</span>
                    <span className={styles.roleStatValue}>
                      {campaign.invitesAccepted}
                    </span>
                  </div>
                  <div className={styles.roleStat}>
                    <span className={styles.roleStatLabel}>Acceptance</span>
                    <span className={styles.roleStatValue}>
                      {Math.round(rate * 100)}%
                    </span>
                  </div>
                  <div className={styles.roleStat}>
                    <span className={styles.roleStatLabel}>This period</span>
                    <span className={styles.roleStatValue}>
                      {campaign.sentThisPeriod}
                    </span>
                  </div>
                </div>
                <span
                  className={styles.track}
                  role="img"
                  aria-label={`${campaign.name}: ${campaign.invitesAccepted} of ${campaign.invitesSent} accepted`}
                >
                  <span
                    className={styles.trackFill}
                    style={
                      { "--fill": `${Math.round(rate * 100)}%` } as React.CSSProperties
                    }
                  />
                </span>
                <p className={styles.panelNote}>{campaign.note}</p>
                <DemoLabel text={campaign.demoLabel} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
