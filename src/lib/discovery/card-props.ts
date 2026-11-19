// JobCardData to the design system's JobCard props, and the sheet behind each card chip (SP3
// plan Task 11A, moved from W5's Task 12 on 10 November 2026). Pure: no visual output. The
// card shows discovery's own labels (spec 8.2 and 8.3), not JobCard's built-in formatting.
import type { JobCardProps } from '@/ui/components';
import type { JobCardData } from './types';

type Handlers = Pick<
  JobCardProps,
  'onSave' | 'onSkip' | 'onApply' | 'onOpenChip' | 'onOpen' | 'onInfo' | 'hideActions' | 'titleAs'
>;

export function toJobCardProps(d: JobCardData, h: Handlers = {}): JobCardProps {
  const cover = d.cover
    ? {
        src: d.cover.src[640],
        alt: d.cover.alt,
        srcSet: `${d.cover.src[320]} 320w, ${d.cover.src[640]} 640w, ${d.cover.src[1280]} 1280w`,
      }
    : null;
  return {
    href: d.href,
    position: d.title,
    host: {
      name: d.host.name,
      logoSrc: d.host.logoUrl,
      href: `/hosts/${d.host.slug}`,
      subscriber: d.host.subscriberSince !== null,
    },
    location: d.locationLabel,
    category: d.category,
    boosted: d.boosted !== null,
    cover,
    starts: { label: d.dateLine.info },
    endLabel: d.dateLine.end ?? undefined,
    housing: { provided: d.housing.provided },
    meals: { provided: d.meals.provided },
    pay: { label: d.pay.chip },
    saved: d.viewer?.disposition === 'saved',
    applied: d.viewer?.applied ?? false,
    ...h,
  };
}

const present = (lines: (string | null)[]) =>
  lines.filter((l): l is string => typeof l === 'string' && l !== '');

/** The pop-up sheet behind a card's Housing, Meals or Pay chip. */
export function chipSheetContent(
  d: JobCardData,
  chip: 'housing' | 'meals' | 'pay',
): { title: string; lines: string[]; footer: { label: string; href: string } } {
  switch (chip) {
    case 'housing':
      return {
        title: 'Housing',
        lines: d.housing.provided ? present([d.housing.costLine, d.housing.note]) : ['No housing'],
        footer: { label: 'All housing details on the listing', href: d.href },
      };
    case 'meals':
      return {
        title: 'Meals',
        lines: d.meals.provided ? present([d.meals.costLine, d.meals.note]) : ['No meals'],
        footer: { label: 'All meal details on the listing', href: d.href },
      };
    case 'pay':
      return {
        title: 'Pay',
        lines: [d.pay.full, ...d.pay.details],
        footer: { label: 'All pay details on the listing', href: d.href },
      };
  }
}
