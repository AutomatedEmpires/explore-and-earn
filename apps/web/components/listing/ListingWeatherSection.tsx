import { fetchWeather } from "../../lib/weather";
import { WeatherWidget } from "./WeatherWidget";

export interface ListingWeatherSectionProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly locationLabel: string | null;
}

/**
 * Async server boundary for listing weather. Keeping the Open-Meteo request in
 * this child lets the listing shell stream while the time-boxed forecast loads.
 */
export async function ListingWeatherSection({
  latitude,
  longitude,
  locationLabel,
}: ListingWeatherSectionProps) {
  const outlook = await fetchWeather(latitude, longitude);

  return <WeatherWidget locationLabel={locationLabel} outlook={outlook} />;
}
