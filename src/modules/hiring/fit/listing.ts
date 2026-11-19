// SP2 hiring info as the fit engine and SP4's pool query read it (SP5 spec 8.2 and 8.3).
// FitListing never goes to SP4; PoolListing is all SP4 sees.
import type { FitListing } from '@/lib/hiring';
import { normalizeSkill, type ListingHiringInfo } from '@/modules/listings';
import type { PoolListing } from '@/modules/profiles';

/** SP4's `cert_key`: NFKC, trimmed, single spaces, lower case. */
export function certKey(label: string): string {
  return label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== ''))];
}

export function toFitListing(
  h: ListingHiringInfo,
  x: { occupationLabel: string; maxPayHourlyCents: number | null; today: string },
): FitListing {
  return {
    category: h.category,
    secondCategory: h.secondCategory,
    occupation: h.occupation,
    occupationLabel: x.occupationLabel,
    startDate: h.startDate ?? x.today,
    endDate: h.endDate,
    weeklyHours: h.when.weeklyHours,
    skillKeys: unique(h.skills.map((skill) => normalizeSkill(skill).key)),
    requiredCertificationKeys: unique(h.requiredCertifications.map(certKey)),
    sponsorship: h.sponsorship,
    state: h.state,
    remoteStates: h.remoteStates,
    maxPayHourlyCents: x.maxPayHourlyCents,
  };
}

export function toPoolListing(h: ListingHiringInfo): PoolListing {
  return {
    listingId: h.id,
    orgId: h.orgId,
    categories: h.secondCategory ? [h.category, h.secondCategory] : [h.category],
    occupationCode: h.occupation,
    sponsorsVisa: h.sponsorship !== 'none',
  };
}
