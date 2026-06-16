import Link from "next/link";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { selectPrimaryAction, type PrimaryActionInput } from "./models";
import styles from "./PrimaryActionCard.module.css";

/** Emotional tone per action — drives the card's accent + CTA color. */
type ActionTone = "offer" | "urgent" | "ready" | "resume" | "match" | "explore";

interface PrimaryActionView {
  readonly icon: IconKey;
  readonly eyebrow: string;
  readonly title: string;
  readonly meta?: string;
  readonly message?: string;
  readonly ctaLabel: string;
  readonly ctaHref: string;
  readonly tone: ActionTone;
}

function toView(input: PrimaryActionInput): PrimaryActionView {
  const action = selectPrimaryAction(input);
  switch (action.kind) {
    case "offer":
      return {
        icon: "status.match",
        eyebrow: "Offer received",
        title: action.offer.listing.title,
        meta: action.offer.expiresOn
          ? `${action.offer.listing.host.name} · Respond by ${action.offer.expiresOn}`
          : action.offer.listing.host.name,
        message: action.offer.messageFromHost,
        ctaLabel: "Review offer",
        ctaHref: "/offered",
        tone: "offer",
      };
    case "invite_expiring":
      return {
        icon: "action.message",
        eyebrow: "Invite expiring soon",
        title: action.invite.listing.title,
        meta: `${action.invite.listing.host.name} · Expires ${action.invite.expiresOn}`,
        ctaLabel: "View invite",
        ctaHref: "/invites",
        tone: "urgent",
      };
    case "accepted_upcoming":
      return {
        icon: "category.seasonal",
        eyebrow: "Upcoming role",
        title: action.role.listing.title,
        meta: `${action.role.listing.location} · Starts ${action.role.startDate}`,
        ctaLabel:
          action.role.travelPlanStatus === "shared"
            ? "View travel plan"
            : "Plan your arrival",
        ctaHref: "/journey",
        tone: "ready",
      };
    case "resume_incomplete":
      return {
        icon: "nav.profile",
        eyebrow: "Finish your resume",
        title: `Your resume is ${action.completion}% complete`,
        meta: "Complete your resume to unlock applying and improve your matches.",
        ctaLabel: "Continue resume",
        ctaHref: "/resume",
        tone: "resume",
      };
    case "strong_match":
      return {
        icon: "status.match",
        eyebrow: "Strong match",
        title: action.listing.title,
        meta: `${action.listing.host.name} · ${action.listing.location}`,
        ctaLabel: "View match",
        ctaHref: "/seek",
        tone: "match",
      };
    default:
      return {
        icon: "nav.seek",
        eyebrow: "Start exploring",
        title: "Find your next adventure",
        meta: "Browse housing, meals, and pay from hosts around the world.",
        ctaLabel: "Explore opportunities",
        ctaHref: "/swipe",
        tone: "explore",
      };
  }
}

export interface PrimaryActionCardProps {
  readonly input: PrimaryActionInput;
}

/**
 * The single dominant "next best action" card on Seeker Home. Exactly one is
 * shown, chosen by selectPrimaryAction (offer → expiring invite → upcoming role
 * → resume → strong match → explore).
 */
export function PrimaryActionCard({ input }: PrimaryActionCardProps) {
  const view = toView(input);
  return (
    <article className={styles.card} data-tone={view.tone}>
      <span className={styles.eyebrow}>
        <Icon name={view.icon} size={16} aria-hidden /> {view.eyebrow}
      </span>
      <h2 className={styles.title}>{view.title}</h2>
      {view.meta ? <p className={styles.meta}>{view.meta}</p> : null}
      {view.message ? <p className={styles.message}>“{view.message}”</p> : null}
      <div className={styles.actions}>
        <Link className={styles.cta} href={view.ctaHref}>
          {view.ctaLabel}
        </Link>
      </div>
    </article>
  );
}
