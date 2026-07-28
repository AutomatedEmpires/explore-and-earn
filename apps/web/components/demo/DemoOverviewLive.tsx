"use client";

import { useDemoSession } from "./DemoSession";
import {
  DemoCommunications,
  DemoNeedsAttention,
  DemoSeasonCalendar,
} from "./DemoOverviewPanels";
import { DemoRolePerformanceCards } from "./DemoRoles";
import { DemoFunnel } from "./DemoAnalyticsWorkspace";
import styles from "./demoChrome.module.css";

/**
 * The live half of the overview.
 *
 * WHY THIS WRAPPER EXISTS. A visitor who moves a candidate on the applicants
 * surface and then returns here must not find the old numbers waiting: two
 * surfaces disagreeing about the same records is precisely the failure the
 * derive-everything rule was written to prevent, and "it is only the demo"
 * would be the wrong answer. So the panels whose content depends on
 * application records read the session list, and every figure in them is
 * recomputed on render.
 *
 * The panels themselves are plain presentational components that take an
 * applicant list — nothing about them is client-specific. This wrapper only
 * supplies the list.
 */
export function DemoOverviewLive() {
  const session = useDemoSession();

  return (
    <>
      <DemoNeedsAttention
        applicants={session.applicants}
        id="tour-needs-attention"
      />

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Live listing performance</h2>
            <p className={styles.panelNote}>
              Each card carries the role&rsquo;s own ratios and the diagnosis
              those ratios produced — never a sentence typed beside a role.
            </p>
          </div>
        </div>
        <DemoRolePerformanceCards applicants={session.applicants} />
      </div>

      <DemoFunnel applicants={session.applicants} id="tour-overview-funnel" />

      <div className={styles.twoCol}>
        <DemoSeasonCalendar applicants={session.applicants} />
        <DemoCommunications />
      </div>
    </>
  );
}
