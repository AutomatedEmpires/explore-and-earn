import {
  DEMO_ANALYTICS_LABEL,
  DEMO_WEEKS,
  deriveFunnel,
  deriveRolePerformance,
  tallyByStage,
  totalApplications,
  type DemoApplicant,
  type DemoWeek,
} from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The analytics workspace: trends, funnel, and a role-by-role comparison.
 *
 * ACCESSIBLE TABLE EQUIVALENTS (spec D25). Every chart here is a picture of a
 * table, so the table ships too — visually hidden beside the chart rather than
 * behind a toggle. A bar chart described only by an aria-label tells a screen
 * reader the shape and withholds the numbers, which for an analytics surface is
 * the whole content.
 */

type WeekKey = keyof Omit<DemoWeek, "label">;

const TREND_SERIES: readonly {
  readonly key: WeekKey;
  readonly label: string;
}[] = [
  { key: "opportunityViews", label: "Opportunity views" },
  { key: "applications", label: "Applications" },
  { key: "saves", label: "Saves" },
];

export function DemoTrendCharts({ id }: { readonly id?: string }) {
  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Ten weeks of the season</h2>
          <p className={styles.panelNote}>
            The weekly counters every headline figure is folded from. If a tile
            says 3,610 views, it is because these ten numbers add to 3,610.
          </p>
        </div>
        <DemoLabel text={DEMO_ANALYTICS_LABEL} />
      </div>

      {TREND_SERIES.map((series) => {
        const values = DEMO_WEEKS.map((week) => week[series.key]);
        const max = Math.max(...values, 1);
        return (
          <section key={series.key}>
            <h3 className={styles.includedTitle}>{series.label}</h3>
            <div className={styles.trendChart} aria-hidden="true">
              {values.map((value, index) => (
                <span
                  key={DEMO_WEEKS[index].label}
                  className={styles.trendBar}
                  style={
                    {
                      "--bar-height": `${Math.max(4, Math.round((value / max) * 100))}%`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            <div className={styles.trendLabels} aria-hidden="true">
              {DEMO_WEEKS.map((week) => (
                <span key={week.label} className={styles.trendLabel}>
                  {week.label}
                </span>
              ))}
            </div>
            <table className={styles.srOnly}>
              <caption>{series.label} by week</caption>
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">{series.label}</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_WEEKS.map((week) => (
                  <tr key={week.label}>
                    <th scope="row">{week.label}</th>
                    <td>{week[series.key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

export function DemoFunnel({
  applicants,
  id,
}: {
  readonly applicants: readonly DemoApplicant[];
  readonly id?: string;
}) {
  const stages = deriveFunnel(applicants);
  const total = totalApplications(applicants);

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>The funnel</h2>
          <p className={styles.panelNote}>
            All {total} applications, in the pipeline&rsquo;s own eight stages.
            The stored status model has no separate value for an interview — it
            is a booked event on an application still in review — so the
            analytics dashboard below counts those {tallyByStage(applicants).interview}{" "}
            inside Reviewing. Same records, stated mapping.
          </p>
        </div>
        <DemoLabel text={DEMO_ANALYTICS_LABEL} />
      </div>
      <ul className={styles.funnelList}>
        {stages.map((stage) => (
          <li key={stage.id} className={styles.funnelRow}>
            <span>{stage.label}</span>
            <span
              className={styles.track}
              role="img"
              aria-label={`${stage.label}: ${stage.count} of ${total}`}
            >
              <span
                className={styles.trackFill}
                style={
                  {
                    "--fill": `${Math.round((stage.count / Math.max(1, total)) * 100)}%`,
                  } as React.CSSProperties
                }
              />
            </span>
            <span className={styles.funnelValue}>{stage.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DemoRoleComparison({
  applicants,
  id,
}: {
  readonly applicants: readonly DemoApplicant[];
  readonly id?: string;
}) {
  const performance = deriveRolePerformance(applicants);

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Role by role</h2>
          <p className={styles.panelNote}>
            Which role is pulling and which one is stalling, with the ratio that
            says so and a diagnosis computed from it.
          </p>
        </div>
        <DemoLabel text={DEMO_ANALYTICS_LABEL} />
      </div>
      <ul className={styles.compareList}>
        {performance.map((entry) => (
          <li key={entry.role.id} className={styles.compareRow}>
            <div className={styles.compareTop}>
              <h3 className={styles.compareName}>{entry.role.title}</h3>
              <span className={styles.compareFigures}>
                <span>{entry.applications} applications</span>
                <span>{entry.viewToApplication.toFixed(1)}% of views</span>
                <span>{entry.saveRate.toFixed(1)}% save rate</span>
                <span>
                  {entry.inviteAcceptance === null
                    ? "no invitations"
                    : `${Math.round(entry.inviteAcceptance * 100)}% invite acceptance`}
                </span>
              </span>
            </div>
            <span
              className={styles.track}
              role="img"
              aria-label={`${entry.role.title}: ${entry.viewToApplication.toFixed(1)} percent of views became applications`}
            >
              <span
                className={styles.trackFill}
                style={
                  {
                    "--fill": `${Math.min(100, Math.round(entry.viewToApplication * 20))}%`,
                  } as React.CSSProperties
                }
              />
            </span>
            <p className={styles.roleDiagnosis}>{entry.diagnosis}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
