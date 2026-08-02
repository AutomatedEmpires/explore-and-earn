import { Icon } from "@explore-and-earn/ui";

import type { WeatherOutlook } from "../../lib/weather";
import { ListingSection } from "./ListingSection";
import styles from "./WeatherWidget.module.css";

export interface WeatherWidgetProps {
  /** Location name for the subtitle, e.g. "Wenatchee, WA". */
  readonly locationLabel: string | null;
  /** The fetched outlook, or null when coords failed / upstream was unavailable. */
  readonly outlook: WeatherOutlook | null;
}

/** Short weekday label from an ISO date, anchored at midday to dodge tz edges. */
function weekday(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { weekday: "short" });
}

/**
 * "Weather" — a location-aware 10-day outlook so a seeker knows what they're
 * moving into. Data comes from the server-side Open-Meteo fetch (real forecast or
 * null). When it's null we show an honest "forecast unavailable" shell rather
 * than inventing conditions. The current icon set only has a clear-sky glyph, so
 * non-clear days show their label without a misleading icon.
 */
export function WeatherWidget({ locationLabel, outlook }: WeatherWidgetProps) {
  // The lib can deliver fewer than the requested 10 days, so the count is
  // derived from what actually arrived — and the unit is stated once here
  // rather than repeated on every temperature. No forecast → no count, no unit.
  const where = locationLabel ? `near ${locationLabel}` : "where you'd be";
  return (
    <ListingSection
      title="Weather"
      icon="category.seasonal"
      headingId="listing-weather"
      subtitle={
        outlook
          ? `A ${outlook.days.length}-day look at conditions ${where}, in °${outlook.temperatureUnit}.`
          : `A look at conditions ${where}.`
      }
    >
      {outlook ? (
        <div
          className={styles.strip}
          role="list"
          aria-label={`${outlook.days.length}-day outlook`}
          tabIndex={0}
        >
          {outlook.days.map((day) => (
            <div key={day.date} className={styles.day} role="listitem">
              <span className={styles.weekday}>{weekday(day.date)}</span>
              <span className={styles.glyph} aria-hidden>
                {day.iconKey ? (
                  <Icon name={day.iconKey} size={22} />
                ) : (
                  <span className={styles.glyphDot} />
                )}
              </span>
              {/* Two bare numbers separated only by font weight told a screen
                  reader "72 degrees 51 degrees" with no way to tell which is
                  which. The visible layout is unchanged; the words are added
                  for assistive tech only. */}
              <span className={styles.temps}>
                <span className={styles.high}>
                  <span className={styles.srOnly}>High </span>
                  {day.highF}&deg;
                </span>
                <span className={styles.low}>
                  <span className={styles.srOnly}>Low </span>
                  {day.lowF}&deg;
                </span>
              </span>
              <span className={styles.label}>{day.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.shell}>
          <Icon name="system.info" size={20} aria-hidden />
          <p className={styles.shellText}>
            The forecast isn&rsquo;t available right now. Check back closer to when
            you&rsquo;d be there for the latest outlook.
          </p>
        </div>
      )}
    </ListingSection>
  );
}
