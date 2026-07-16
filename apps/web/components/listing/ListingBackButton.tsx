"use client";

import { useRouter } from "next/navigation";

import { Icon } from "@explore-and-earn/ui";

import styles from "./ListingBackButton.module.css";

/**
 * Back control for the listing-detail page. Prefers the browser's own history
 * (router.back()) so a seeker returns exactly where they came from — discover,
 * map, saved. Falls back to /seek when there is no in-app history to pop (a cold
 * deep-link / shared URL), so the control is never a dead end.
 *
 * Overlaid on the immersive hero, so it carries its own frosted chip styling for
 * legibility over a photo.
 */
export function ListingBackButton() {
  const router = useRouter();

  function handleBack() {
    // history.length > 1 means there IS somewhere to go back to within the tab;
    // otherwise this was opened cold (new tab / shared link) and back() would
    // leave the app, so we route to the discover surface instead.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/seek");
    }
  }

  return (
    <button type="button" onClick={handleBack} className={styles.button}>
      <Icon name="action.back" size={20} aria-hidden />
      <span>Back</span>
    </button>
  );
}
