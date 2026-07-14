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
  return (
    <ListingSection
      title="Weather"
      icon="category.seasonal"
      headingId="listing-weather"
      subtitle={
        locationLabel
          ? `A 10-day look at conditions near ${locationLabel}.`
          : "A 10-day look at conditions where you'd be."
      }
    >
      {outlook ? (
        <div className={styles.strip} role="list">
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
              <span className={styles.temps}>
                <span className={styles.high}>{day.highF}&deg;</span>
                <span className={styles.low}>{day.lowF}&deg;</span>
              </span>
              <span className={styles.label}>{day.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.shell}>
          <Icon name="system.info" size={20} aria-hidden />
          <p className={styles.shellText}>
            The forecast isn&rsquo;t available right now. Check back closer to your
            start date for the latest outlook.
          </p>
        </div>
      )}
    </ListingSection>
  );
}
