// Structured data for listing and landing pages (SP3 spec 8.11, plan Task 41). Every `<` in
// the output is escaped as \u003c so a listing description cannot close the script tag.
import { stateByCode } from '@/lib/discovery';
import type { ListingDetail } from '@/lib/discovery';

const PAY_UNIT: Record<string, string> = {
  hour: 'HOUR',
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
};

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Contractors are CONTRACTOR only. Employees add TEMPORARY for fixed and season dates. */
function employmentType(detail: ListingDetail): string[] {
  if (detail.content.basics.employmentType === 'contractor') return ['CONTRACTOR'];
  const hours = detail.content.basics.schedule === 'part_time' ? 'PART_TIME' : 'FULL_TIME';
  const dates = detail.content.when.dates.mode;
  return dates === 'fixed' || dates === 'season' ? [hours, 'TEMPORARY'] : [hours];
}

function locationFields(detail: ListingDetail): Record<string, unknown> {
  const where = detail.content.where;
  if (where.mode === 'remote') {
    return {
      jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements:
        where.scope === 'all_us'
          ? { '@type': 'Country', name: 'US' }
          : where.states.map((code) => ({
              '@type': 'State',
              name: stateByCode(code)?.name ?? code,
            })),
    };
  }
  const match = /^(.*), ([A-Z]{2})$/.exec(detail.locationLabel);
  return {
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: match?.[1] ?? detail.locationLabel,
        addressRegion: match?.[2] ?? '',
        addressCountry: 'US',
      },
    },
  };
}

/** Dollars, or nothing for season pay and crew share (spec 8.11). */
function baseSalary(detail: ListingDetail): Record<string, unknown> | null {
  const pay = detail.content.pay;
  const unitText = PAY_UNIT[pay.unit];
  if (!unitText) return null;
  return {
    '@type': 'MonetaryAmount',
    currency: 'USD',
    value: {
      '@type': 'QuantitativeValue',
      minValue: pay.minCents / 100,
      maxValue: pay.maxCents / 100,
      unitText,
    },
  };
}

function hiringOrganization(detail: ListingDetail, appUrl: string): Record<string, unknown> {
  const org: Record<string, unknown> = {
    '@type': 'Organization',
    name: detail.host.name,
    sameAs: `${appUrl.replace(/\/$/, '')}/hosts/${detail.host.slug}`,
  };
  if (detail.host.logoUrl) org.logo = detail.host.logoUrl;
  return org;
}

/** JobPosting JSON-LD for an active listing page. */
export function buildJobPostingJsonLd(detail: ListingDetail, appUrl: string): string {
  const benefits = [
    detail.housing.provided ? 'Housing provided' : null,
    detail.meals.provided ? 'Meals provided' : null,
  ].filter((benefit): benefit is string => benefit !== null);
  const salary = baseSalary(detail);
  const body: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: detail.title,
    description: detail.content.job.description,
    datePosted: detail.publishedAt,
    employmentType: employmentType(detail),
    hiringOrganization: hiringOrganization(detail, appUrl),
    directApply: true,
    identifier: {
      '@type': 'PropertyValue',
      name: 'Explore&Earn',
      value: detail.listingId,
    },
    ...locationFields(detail),
  };
  if (detail.validThrough) body.validThrough = detail.validThrough;
  if (salary) body.baseSalary = salary;
  if (benefits.length > 0) body.jobBenefits = benefits;
  return escapeJson(body);
}

/** BreadcrumbList JSON-LD. */
export function buildBreadcrumbJsonLd(
  items: { name: string; path: string }[],
  appUrl: string,
): string {
  const base = appUrl.replace(/\/$/, '');
  return escapeJson({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${base}${item.path.startsWith('/') ? item.path : `/${item.path}`}`,
    })),
  });
}
