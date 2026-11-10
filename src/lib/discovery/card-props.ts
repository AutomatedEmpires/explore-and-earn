// JobCardData to the design system's JobCard props (SP3 plan Task 12). W0 stub: W5 replaces it.
import type { JobCardProps } from '@/ui/components';
import type { JobCardData } from './types';

export function toJobCardProps(
  _d: JobCardData,
  _h: Pick<
    JobCardProps,
    'onSave' | 'onSkip' | 'onApply' | 'onOpenChip' | 'onOpen' | 'onInfo' | 'hideActions' | 'titleAs'
  > = {},
): JobCardProps {
  throw new Error('not implemented: toJobCardProps');
}

/** The pop-up sheet behind a card's Housing, Meals or Pay chip. */
export function chipSheetContent(
  _d: JobCardData,
  _chip: 'housing' | 'meals' | 'pay',
): { title: string; lines: string[]; footer: { label: string; href: string } } {
  throw new Error('not implemented: chipSheetContent');
}
