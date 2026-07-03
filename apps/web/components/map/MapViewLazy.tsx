"use client";

import dynamic from "next/dynamic";

import type { MapViewProps } from "./MapView";

/**
 * Client-side lazy loader for the interactive Mapbox map.
 *
 * MapView statically pulls in mapbox-gl + react-map-gl (~200KB+) and needs
 * `window`, so it must not be server-rendered. Loading it through next/dynamic
 * with `ssr: false` splits it into its own chunk that streams in after the route
 * shell paints — behind a lightweight skeleton — instead of blocking the map
 * route's first render on the full Mapbox parse. `next/dynamic({ ssr: false })`
 * is only valid inside a Client Component, which is why this thin wrapper exists.
 */
const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      style={{
        width: "100%",
        height: "100%",
        minHeight: "60vh",
        background: "var(--surface-sunken, #ece7dd)",
        borderRadius: "var(--radius-lg, 16px)",
      }}
    />
  ),
});

export function MapViewLazy(props: MapViewProps) {
  return <MapView {...props} />;
}
