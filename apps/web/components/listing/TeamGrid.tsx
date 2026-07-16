import Image from "next/image";

import { Icon } from "@explore-and-earn/ui";

import { ListingSection } from "./ListingSection";
import styles from "./TeamGrid.module.css";

export interface TeamMember {
  readonly name: string;
  readonly role: string;
  readonly photoUrl?: string | null;
}

export interface TeamGridProps {
  readonly members: readonly TeamMember[];
}

/** First letter of a name, uppercased — the placeholder monogram when no photo. */
function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "";
}

/**
 * "Meet the team" — the faces a seeker would be joining, straight from the host
 * narrative. Members without a photo get a framed monogram placeholder (never a
 * fabricated stock image). Renders nothing when there are no members.
 */
export function TeamGrid({ members }: TeamGridProps) {
  if (members.length === 0) return null;

  return (
    <ListingSection
      title="Meet the team"
      icon="status.filled"
      headingId="listing-team"
      subtitle="The people you'd be working alongside."
    >
      <ul className={styles.grid}>
        {members.map((member) => (
          <li key={`${member.name}-${member.role}`} className={styles.member}>
            <div className={styles.avatar}>
              {member.photoUrl ? (
                <Image
                  src={member.photoUrl}
                  alt={member.name}
                  fill
                  className={styles.avatarImg}
                  sizes="56px"
                />
              ) : (
                <span className={styles.monogram} aria-hidden>
                  {initial(member.name) || <Icon name="nav.profile" size={24} aria-hidden />}
                </span>
              )}
            </div>
            <div className={styles.identity}>
              <span className={styles.name}>{member.name}</span>
              <span className={styles.role}>{member.role}</span>
            </div>
          </li>
        ))}
      </ul>
    </ListingSection>
  );
}
