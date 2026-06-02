import {
  Badge,
  Card,
  Chip,
  FoundingCountdown,
  Icon,
  Meter,
  VerifiedHostBadge,
  type IconKey,
} from "@explore-and-earn/ui";
import type {
  BenefitProvision,
  DiscoveryCardConditionalBadge,
} from "@explore-and-earn/contracts";

import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  resolveCoverImage,
  type DiscoveryListing,
} from "./listing";
import styles from "./DiscoveryCard.module.css";

export interface DiscoveryCardProps {
  readonly listing: DiscoveryListing;
}

interface ConditionalBadgeConfig {
  readonly label: string;
  readonly icon: IconKey;
  readonly variant: "featured" | "seasonal" | "boosted";
}

const CONDITIONAL_BADGE: Record<
  DiscoveryCardConditionalBadge,
  ConditionalBadgeConfig
> = {
  seasonal: {
    label: "Seasonal",
    icon: "category.seasonal",
    variant: "seasonal",
  },
  featured: {
    label: "Featured",
    icon: "trust.featured_employer",
    variant: "featured",
  },
  boosted: {
    label: "Boosted",
    icon: "status.boosted",
    variant: "boosted",
  },
};

const PROVISION_LABEL: Record<BenefitProvision, string> = {
  provided: "Provided",
  partial: "Partial",
  not_provided: "Not provided",
};

function benefitText(
  kind: string,
  provision: BenefitProvision,
  summary?: string,
): string {
  return `${kind} · ${summary ?? PROVISION_LABEL[provision]}`;
}

export function DiscoveryCard({ listing }: DiscoveryCardProps) {
  const {
    title,
    category,
    location,
    opportunityWindow,
    host,
    benefits,
    cover,
    conditionalBadges = [],
    matchScore,
    founding,
  } = listing;

  const coverImage = resolveCoverImage(cover);

  return (
    <Card>
      <div className={styles.card}>
        <div className={styles.cover}>
          {coverImage ? (
            <img
              className={styles.coverImage}
              src={coverImage.masterPath}
              alt={coverImage.alt}
              loading="lazy"
            />
          ) : (
            <span className={styles.coverFallback}>
              <Icon name={CATEGORY_ICON[category]} size={24} aria-hidden />
            </span>
          )}
        </div>

        <div className={styles.badges}>
          <Chip icon={CATEGORY_ICON[category]}>{CATEGORY_LABEL[category]}</Chip>
          {host.verified ? <VerifiedHostBadge /> : null}
          {conditionalBadges.map((badge) => {
            const config = CONDITIONAL_BADGE[badge];
            return (
              <Badge
                key={badge}
                label={config.label}
                icon={config.icon}
                variant={config.variant}
              />
            );
          })}
        </div>

        <h2 className={styles.title}>{title}</h2>

        <p className={styles.meta}>
          <span>{location}</span>
          <span aria-hidden> · </span>
          <span>{opportunityWindow}</span>
        </p>

        <ul className={styles.triad}>
          <li>
            <Chip icon="benefit.housing">
              {benefitText(
                "Housing",
                benefits.housing.provision,
                benefits.housing.summary,
              )}
            </Chip>
          </li>
          <li>
            <Chip icon="benefit.meals">
              {benefitText(
                "Meals",
                benefits.meals.provision,
                benefits.meals.summary,
              )}
            </Chip>
          </li>
          <li>
            <Chip icon="benefit.pay">
              {benefitText("Pay", benefits.pay.provision, benefits.pay.summary)}
            </Chip>
          </li>
        </ul>

        {(matchScore !== undefined || founding) && (
          <div className={styles.footer}>
            {matchScore !== undefined ? (
              <Meter value={matchScore} label="Match" />
            ) : null}
            {founding ? <FoundingCountdown /> : null}
          </div>
        )}
      </div>
    </Card>
  );
}
