import { Icon } from "@explore-and-earn/ui";

import styles from "./WeatherWidget.module.css";

export interface WeatherWidgetProps {
  /** Human-readable place the forecast is for (e.g. "Sitka, Alaska"). */
  readonly location: string;
  /** How many day columns to lay out. Founder spec: 10-day forecast. */
  readonly days?: number;
}

interface ForecastDay {
  readonly key: string;
  readonly weekday: string;
  readonly dayNum: string;
  readonly isToday: boolean;
}

/**
 * Build the next `days` calendar days as honest column headers. These are real
 * calendar dates (not fabricated weather) — the hi/lo and condition slots stay
 * empty placeholders until a live feed is wired.
 */
function buildDays(days: number): ForecastDay[] {
  const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const now = Date.now();
  const out: ForecastDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now + i * 86_400_000);
    out.push({
      key: d.toISOString().slice(0, 10),
      weekday: i === 0 ? "Today" : weekdayFmt.format(d),
      dayNum: String(d.getDate()),
      isToday: i === 0,
    });
  }
  return out;
}

/**
 * WeatherWidget — a self-contained 10-day forecast panel for a host's location.
 *
 * There is NO weather API wired yet, so this renders the intended layout with an
 * HONEST placeholder state: real calendar day columns, empty hi/lo + condition
 * slots, and a clear "connects at launch" note. When a real feed lands, drop the
 * values into the per-day cells — the shell (columns, hi/lo, condition icon) is
 * already in place. No fabricated forecast data.
 */
export function WeatherWidget({ location, days = 10 }: WeatherWidgetProps) {
  const forecast = buildDays(days);

  return (
    <section className={styles.panel} aria-labelledby="weather-heading">
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 id="weather-heading" className={styles.title}>
            <span className={styles.titleIcon} aria-hidden>
              <Icon name="category.seasonal" size={18} />
            </span>
            {days}-day forecast
          </h2>
          <p className={styles.locationLine}>
            <Icon name="nav.map" size={14} aria-hidden />
            {location}
          </p>
        </div>
        <span className={styles.pendingTag}>
          <Icon name="system.info" size={14} aria-hidden />
          Connects at launch
        </span>
      </div>

      <ol className={styles.track} role="list">
        {forecast.map((day) => (
          <li
            key={day.key}
            className={styles.day}
            data-today={day.isToday ? "" : undefined}
          >
            <span className={styles.dayName}>{day.weekday}</span>
            <span className={styles.dayNum}>{day.dayNum}</span>
            <span className={styles.condition} aria-hidden>
              <Icon name="status.open" size={22} />
            </span>
            <span className={styles.temps}>
              <span className={styles.tempHi}>&mdash;&deg;</span>
              <span className={styles.tempLo}>&mdash;&deg;</span>
            </span>
          </li>
        ))}
      </ol>

      <p className={styles.foot}>
        Live 10-day forecast for {location} connects at launch.
      </p>
    </section>
  );
}
