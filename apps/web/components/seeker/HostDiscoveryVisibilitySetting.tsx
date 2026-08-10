"use client";

import { useRef, useState } from "react";

import {
  updateHostDiscoverySettingAction,
  type HostDiscoverySettingActionResult,
} from "../../app/actions/seekerSettings";
import styles from "./HostDiscoveryVisibilitySetting.module.css";

export interface HostDiscoveryVisibilitySettingProps {
  readonly initial: HostDiscoverySettingActionResult;
}

/** Explicit, owner-controlled opt-in for pre-application host discovery. */
export function HostDiscoveryVisibilitySetting({
  initial,
}: HostDiscoveryVisibilitySettingProps) {
  const [enabled, setEnabled] = useState<boolean | null>(
    initial.ok ? initial.enabled : null,
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    | { readonly kind: "success"; readonly message: string }
    | { readonly kind: "error"; readonly message: string }
    | null
  >(null);
  const inFlight = useRef(false);

  async function handleToggle() {
    if (enabled === null || inFlight.current) return;
    const next = !enabled;
    inFlight.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await updateHostDiscoverySettingAction(next);
      if (!result.ok) {
        setFeedback({
          kind: "error",
          message: "We couldn’t update host discovery. Try again.",
        });
        return;
      }
      setEnabled(result.enabled);
      setFeedback({
        kind: "success",
        message: result.enabled
          ? "Host discovery permission is on. This profile appears only while it is complete, platform-visible, and otherwise eligible."
          : "Host discovery permission is off. This profile is not shown in host search or sourcing.",
      });
    } catch {
      setFeedback({
        kind: "error",
        message: "We couldn’t update host discovery. Try again.",
      });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="host-discovery-setting-title">
      <div className={styles.copy}>
        <h3 id="host-discovery-setting-title" className={styles.title}>
          Host discovery permission
        </h3>
        <p id="host-discovery-setting-description" className={styles.description}>
          Off by default. Turning this on saves your permission for eligible
          hosts with live, verified listings to find your display name, bio,
          general skills, preferred categories, and match score, then invite
          you to apply. Your profile appears only while it is complete,
          platform-visible, and otherwise eligible. Structured account contact
          fields, exact availability, pay preferences, and your résumé stay
          private until you choose to engage.
        </p>
      </div>
      <div className={styles.control}>
        <span className={styles.state} aria-live="polite">
          {enabled === null
            ? "Unavailable"
            : saving
              ? "Saving…"
              : enabled
                ? "Permission on"
                : "Permission off"}
        </span>
        {enabled !== null ? (
          <button
            type="button"
            className={styles.switch}
            role="switch"
            aria-checked={enabled}
            aria-disabled={saving}
            aria-describedby="host-discovery-setting-description"
            aria-label="Allow eligible hosts to find my profile"
            onClick={handleToggle}
          >
            <span className={styles.track} data-enabled={enabled ? "true" : "false"}>
              <span className={styles.thumb} />
            </span>
          </button>
        ) : null}
      </div>
      {enabled === null ? (
        <p className={styles.error} role="alert">
          We couldn’t load this setting. Refresh the page before changing host
          discovery.
        </p>
      ) : feedback ? (
        <p
          className={feedback.kind === "error" ? styles.error : styles.success}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
