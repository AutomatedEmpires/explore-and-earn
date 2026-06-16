import type { Metadata } from "next";
import Link from "next/link";

import { auth, currentUser } from "@clerk/nextjs/server";
import { Icon } from "@explore-and-earn/ui";

import {
  BucketChips,
  LifecycleList,
  PrimaryActionCard,
  SectionHeading,
  StatusStrip,
  getMatchedListings,
  getPrimaryActionInput,
  getSeekerStatus,
} from "../../../components/seeker";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
};

const DISCOVERY_LANES = [
  {
    href: "/swipe",
    title: "Swipe",
    description: "Single-card discovery for fast skip or save decisions.",
    icon: "nav.swipe",
  },
  {
    href: "/map",
    title: "Map",
    description: "Geographic browse with pins, popup cards, and map-first decisions.",
    icon: "nav.map",
  },
  {
    href: "/seek",
    title: "Seek",
    description: "Scroll the full listing feed with filters and shared listing cards.",
    icon: "nav.seek",
  },
] as const;

export default async function SeekerHomePage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;
  const user = userId ? await currentUser() : null;
  const fallbackName = user?.firstName ?? null;

  const [status, primaryActionInput, matchedListings] = await Promise.all([
    getSeekerStatus(token, userId, fallbackName),
    getPrimaryActionInput(token, userId),
    getMatchedListings(token, userId),
  ]);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Explore</p>
          <h1 className={styles.title}>Choose the lane that matches how you want to discover work.</h1>
          <p className={styles.summary}>
            Swipe for fast single-card decisions, Map for geography-first browsing, or Seek for the full listing feed. Community now lives on its own header tab.
          </p>
        </div>
        <div className={styles.routeGrid}>
          {DISCOVERY_LANES.map((lane) => (
            <Link key={lane.href} className={styles.routeCard} href={lane.href}>
              <span className={styles.routeIcon}>
                <Icon name={lane.icon} size={20} aria-hidden />
              </span>
              <span className={styles.routeText}>
                <span className={styles.routeTitle}>{lane.title}</span>
                <span className={styles.routeDescription}>{lane.description}</span>
              </span>
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <SectionHeading
          title="Your adventure command center"
          description="What matters now, and your next best action."
        />
        <StatusStrip status={status} />
      </section>

      <section className={styles.block}>
        <PrimaryActionCard input={primaryActionInput} />
      </section>

      <section className={styles.block}>
        <SectionHeading
          title="Matched listings"
          description="Relevance is shown as a neutral signal — never a score to chase."
          actionLabel="See all"
          actionHref="/seek"
        />
        <LifecycleList
          items={matchedListings.map((listing) => ({ listing, cardState: "matched" as const }))}
          surface="matched"
          emptyTitle="No matches yet"
          emptyMessage="Complete your resume and preferences to start seeing matched opportunities."
          emptyActionLabel="Build your resume"
          emptyActionHref="/resume"
        />
      </section>

      <section className={styles.block}>
        <SectionHeading title="Your applications" description="Jump back into any bucket." />
        <BucketChips status={status} />
      </section>
    </>
  );
}
