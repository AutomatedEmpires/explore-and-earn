// The minimum-wage warning's pay conversion (spec section 8.2): hour, week, month and year pay
// become an hourly rate using the listing's weekly hours; day, season and crew share are skipped.
import type { ListingContent } from './content';

type Pay = Pick<ListingContent['pay'], 'minCents' | 'unit'>;

const WEEKS_PER_YEAR = 52;

/** The bottom of the pay range per hour, in cents, or null when the unit can't be converted. */
export function hourlyPayCents(pay: Pay, weeklyHours: number): number | null {
  if (!(weeklyHours > 0)) return pay.unit === 'hour' ? pay.minCents : null;
  switch (pay.unit) {
    case 'hour':
      return pay.minCents;
    case 'week':
      return pay.minCents / weeklyHours;
    case 'month':
      return (pay.minCents * 12) / WEEKS_PER_YEAR / weeklyHours;
    case 'year':
      return pay.minCents / WEEKS_PER_YEAR / weeklyHours;
    default:
      return null;
  }
}
