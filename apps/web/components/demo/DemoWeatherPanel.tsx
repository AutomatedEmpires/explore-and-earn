"use client";

import { useEffect, useState } from "react";

import { WeatherWidget } from "../host/WeatherWidget";
import { DEMO_ORG, DEMO_SAMPLE_LABEL } from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The season-band weather panel.
 *
 * Renders the REAL WeatherWidget, which is honest by construction: it lays out
 * true calendar day columns and leaves the hi/lo and condition slots empty
 * because no weather feed is wired. The demo label says the panel is sample
 * data; the widget itself still refuses to invent a forecast.
 *
 * WHY THIS IS A CLIENT COMPONENT WITH A MOUNT GATE. The widget builds its
 * columns from `Date.now()`. The rest of the demo workspace is static, so a
 * server-rendered forecast would be frozen at BUILD time and every visit after
 * the first day would hydrate a different set of dates over it — a real
 * mismatch, and a panel quietly showing last week. Deferring the widget to the
 * client makes the dates the visitor's own, which is also the only reading of
 * "today's conditions" that means anything.
 */
export function DemoWeatherPanel({ id }: { readonly id?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h3 className={styles.panelTitle}>Conditions at the property</h3>
          <p className={styles.panelNote}>
            A season is run on the weather, so the forecast sits beside the rota
            rather than in another tab.
          </p>
        </div>
        <DemoLabel text={DEMO_SAMPLE_LABEL} />
      </div>
      {mounted ? (
        <WeatherWidget location={DEMO_ORG.location} days={7} />
      ) : (
        <p className={styles.panelNote}>
          Loading the next seven days for {DEMO_ORG.location}.
        </p>
      )}
    </div>
  );
}
