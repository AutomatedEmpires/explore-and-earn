import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import { DEMO_ACCOUNT_PEOPLE, DEMO_ORG } from "./enterpriseDemo";
import { plansIncluding } from "./tourStops";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * Who is on the account.
 *
 * THIS SURFACE DELIBERATELY SELLS NOTHING. The invite / accept / revoke
 * plumbing exists, but accepting an invitation currently grants a colleague NO
 * access: no policy admits a membership row to a listing, an application, a
 * conversation or an analytics figure, which is why every tier in
 * PLAN_ENTITLEMENTS carries zero colleague seats. So the demo shows the
 * invitation records the product can genuinely store, states the access
 * position in plain words, and reads the included count straight off the
 * contract — where it renders as "not included on any plan yet" rather than as
 * a feature.
 *
 * Fictional people get initials. There is no photograph of a person anywhere on
 * this page, and there will not be one while the people are invented.
 */
export function DemoAccountPeoplePanel({ id }: { readonly id?: string }) {
  const included = PLAN_ENTITLEMENTS[DEMO_ORG.planTier].teamSeats;

  return (
    <div id={id}>
      <div className={styles.callout}>
        <p className={styles.calloutTitle}>
          Colleague access: {plansIncluding((entitlement) => entitlement.teamSeats > 0)}
        </p>
        <p className={styles.calloutBody}>
          The {DEMO_ORG.planName} plan includes {included} colleague seats today.
          Invitations can be sent, accepted and revoked, and the record is kept —
          but accepting one does not yet open this workspace to the person who
          accepted it. That is stated here rather than implied, because an
          invitation that looks like access is worse than no invitation at all.
        </p>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>People on this account</h2>
            <p className={styles.panelNote}>
              The owner, plus the invitations this season has sent.
            </p>
          </div>
        </div>

        <ul className={styles.peopleList}>
          {DEMO_ACCOUNT_PEOPLE.map((person) => (
            <li key={person.id} className={styles.person}>
              <span className={styles.avatar} aria-hidden="true">
                {person.initials}
              </span>
              <div className={styles.personBody}>
                <p className={styles.personName}>{person.name}</p>
                <p className={styles.personRole}>{person.jobTitle}</p>
                <p className={styles.personRole}>
                  {person.invitationState === "owner"
                    ? "Account owner"
                    : person.invitationState === "accepted"
                      ? `Invitation accepted · sent ${person.invitedOn}`
                      : `Invitation pending · sent ${person.invitedOn}`}
                </p>
                <p className={styles.personAccess}>{person.accessNote}</p>
                <DemoLabel text={person.demoLabel} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
