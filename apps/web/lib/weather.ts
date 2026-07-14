import "server-only";

import type { IconKey } from "@explore-and-earn/ui";

/**
 * Location-aware weather for the immersive listing-detail page ("what's the
 * climate where I'd be moving?"). Backed by Open-Meteo's free forecast API — no
 * API key, no account. Server-only: results are cached by Next for an hour
 * (`next.revalidate`) and the fetch is time-boxed so a slow/failed upstream
 * never blocks or crashes the page render. On ANY failure this returns null and
 * the UI shows an honest "forecast unavailable" shell — it NEVER throws and
 * NEVER fabricates a forecast.
 *
 * Endpoint (10-day daily outlook, Fahrenheit, timezone auto-resolved):
 *   https://api.open-meteo.com/v1/forecast
 *     ?latitude=..&longitude=..
 *     &daily=temperature_2m_max,temperature_2m_min,weather_code
 *     &forecast_days=10&temperature_unit=fahrenheit&timezone=auto
 */

/** Coarse weather family — presentation-agnostic; lets the UI pick its own glyph. */
export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunderstorm";

/** A single day in the outlook. */
export interface WeatherDay {
  /** ISO calendar date (YYYY-MM-DD) in the location's timezone. */
  date: string;
  /** Daily high, °F (rounded). */
  highF: number;
  /** Daily low, °F (rounded). */
  lowF: number;
  /** Raw WMO weather-interpretation code returned by Open-Meteo. */
  code: number;
  /** Coarse condition family (for UI icon selection / grouping). */
  condition: WeatherCondition;
  /** Short human label, e.g. "Sunny", "Light rain", "Thunderstorm". */
  label: string;
  /**
   * Best-effort <Icon> registry key — present ONLY where the current registry
   * has a fitting glyph (clear skies → the Sun icon). The icon set carries no
   * cloud/rain/snow glyphs today (and this layer must NOT add registry keys), so
   * for every other condition this is undefined and the UI picks a safe existing
   * icon from `condition`.
   */
  iconKey?: IconKey;
}

/** The typed 10-day outlook returned by {@link fetchWeather}. */
export interface WeatherOutlook {
  /** Up to 10 days, chronological (soonest first). */
  days: WeatherDay[];
  /** IANA timezone Open-Meteo resolved for the coordinates (e.g. "America/Anchorage"). */
  timezone: string;
  /** Temperature unit for every value in `days`. */
  temperatureUnit: "F";
}

/** Sun glyph in the icon registry — the one condition we have a real icon for. */
const CLEAR_ICON: IconKey = "category.seasonal";

/**
 * Interpret a WMO weather-interpretation code (the fixed set Open-Meteo returns)
 * into a condition family, a short label, and — where one exists — an icon key.
 */
function interpretWeatherCode(code: number): {
  condition: WeatherCondition;
  label: string;
  iconKey?: IconKey;
} {
  switch (code) {
    case 0:
      return { condition: "clear", label: "Clear sky", iconKey: CLEAR_ICON };
    case 1:
      return { condition: "clear", label: "Mainly clear", iconKey: CLEAR_ICON };
    case 2:
      return { condition: "partly-cloudy", label: "Partly cloudy" };
    case 3:
      return { condition: "cloudy", label: "Overcast" };
    case 45:
      return { condition: "fog", label: "Fog" };
    case 48:
      return { condition: "fog", label: "Freezing fog" };
    case 51:
      return { condition: "drizzle", label: "Light drizzle" };
    case 53:
      return { condition: "drizzle", label: "Drizzle" };
    case 55:
      return { condition: "drizzle", label: "Heavy drizzle" };
    case 56:
    case 57:
      return { condition: "drizzle", label: "Freezing drizzle" };
    case 61:
      return { condition: "rain", label: "Light rain" };
    case 63:
      return { condition: "rain", label: "Rain" };
    case 65:
      return { condition: "rain", label: "Heavy rain" };
    case 66:
    case 67:
      return { condition: "rain", label: "Freezing rain" };
    case 71:
      return { condition: "snow", label: "Light snow" };
    case 73:
      return { condition: "snow", label: "Snow" };
    case 75:
      return { condition: "snow", label: "Heavy snow" };
    case 77:
      return { condition: "snow", label: "Snow grains" };
    case 80:
      return { condition: "rain", label: "Light showers" };
    case 81:
      return { condition: "rain", label: "Showers" };
    case 82:
      return { condition: "rain", label: "Heavy showers" };
    case 85:
      return { condition: "snow", label: "Snow showers" };
    case 86:
      return { condition: "snow", label: "Heavy snow showers" };
    case 95:
      return { condition: "thunderstorm", label: "Thunderstorm" };
    case 96:
    case 99:
      return { condition: "thunderstorm", label: "Thunderstorm with hail" };
    default:
      // Open-Meteo only emits the enumerated WMO codes above; treat anything
      // unexpected as a neutral overcast rather than inventing a condition.
      return { condition: "cloudy", label: "Overcast" };
  }
}

/** Shape of the slice of the Open-Meteo response we consume. */
interface OpenMeteoDaily {
  time?: unknown;
  temperature_2m_max?: unknown;
  temperature_2m_min?: unknown;
  weather_code?: unknown;
}

/** True only for a finite JS number (Number.isFinite already excludes NaN/±∞). */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Approximate upstream timeout (ms) — never let a slow API stall the render. */
const WEATHER_TIMEOUT_MS = 4000;

/**
 * Fetch a 10-day daily outlook (°F) for a coordinate. Returns null on invalid
 * coordinates, a timeout, a non-OK response, malformed JSON, or any other
 * failure — the caller renders an honest shell. Never throws.
 */
export async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherOutlook | null> {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "temperature_2m_max,temperature_2m_min,weather_code",
    forecast_days: "10",
    temperature_unit: "fahrenheit",
    timezone: "auto",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Cache the outlook for an hour — a 10-day daily forecast does not need
      // per-request freshness, and this shields the API from render fan-out.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      daily?: OpenMeteoDaily;
      timezone?: unknown;
    };
    const daily = json.daily;
    if (!daily) return null;

    const times = Array.isArray(daily.time) ? daily.time : [];
    const maxes = Array.isArray(daily.temperature_2m_max)
      ? daily.temperature_2m_max
      : [];
    const mins = Array.isArray(daily.temperature_2m_min)
      ? daily.temperature_2m_min
      : [];
    const codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];

    // Zip defensively to the shortest column so a truncated response can't
    // produce half-populated days.
    const count = Math.min(times.length, maxes.length, mins.length, codes.length);
    const days: WeatherDay[] = [];
    for (let i = 0; i < count; i += 1) {
      const date = times[i];
      const high = maxes[i];
      const low = mins[i];
      const code = codes[i];
      if (
        typeof date !== "string" ||
        !isFiniteNumber(high) ||
        !isFiniteNumber(low) ||
        !isFiniteNumber(code)
      ) {
        continue;
      }
      const interpreted = interpretWeatherCode(code);
      days.push({
        date,
        highF: Math.round(high),
        lowF: Math.round(low),
        code,
        condition: interpreted.condition,
        label: interpreted.label,
        ...(interpreted.iconKey ? { iconKey: interpreted.iconKey } : {}),
      });
    }

    if (days.length === 0) return null;

    return {
      days,
      timezone: typeof json.timezone === "string" ? json.timezone : "auto",
      temperatureUnit: "F",
    };
  } catch {
    // AbortError (timeout), network failure, or JSON parse error — all degrade
    // to the honest "forecast unavailable" shell.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
