// Card props and chip sheets (SP3 plan Task 11A): JobCardData maps onto JobCard's label props,
// and each chip's sheet reads the card's amenity and pay lines.
import { describe, expect, it, vi } from 'vitest';
import { chipSheetContent, toJobCardProps } from './card-props';
import type { JobCardData } from './types';

const ID = '019a4a3c-0000-7000-8000-0000000000d1';
const media = (w: number) => `https://media.test/cover/${w}.webp`;

function card(o: Partial<JobCardData> = {}): JobCardData {
  return {
    listingId: ID,
    href: `/jobs/view/${ID}/lift-operator?source=seek`,
    title: 'Lift operator',
    category: 'seasonal',
    secondaryCategory: null,
    genre: 'ski-resorts',
    status: 'active',
    remote: false,
    locationLabel: 'Breckenridge, CO',
    host: {
      orgId: '019a4a3c-0000-7000-8000-00000000a001',
      name: 'Kettle Ridge Lodge',
      slug: 'kettle-ridge-lodge',
      logoUrl: 'https://media.test/logo/320.webp',
      subscriberSince: '2026-11-03',
    },
    cover: { src: { 320: media(320), 640: media(640), 1280: media(1280) }, alt: 'The base lodge' },
    dateLine: { info: 'Summer 2027', end: null },
    housing: {
      provided: true,
      free: false,
      costLine: '$150/week · deducted from pay',
      note: 'Shared room near the lift',
    },
    meals: { provided: false, free: false, costLine: null, note: null },
    pay: {
      chip: '$19/hr',
      full: '$19/hr',
      details: ['Overtime available', 'Paid every 2 weeks'],
    },
    sponsorsVisas: false,
    boosted: null,
    viewer: null,
    ...o,
  };
}

describe('toJobCardProps', () => {
  it('maps the card onto the label props', () => {
    const p = toJobCardProps(card({ dateLine: { info: 'Starts in 3 days', end: 'Ongoing' } }));
    expect(p).toMatchObject({
      href: `/jobs/view/${ID}/lift-operator?source=seek`,
      position: 'Lift operator',
      host: {
        name: 'Kettle Ridge Lodge',
        logoSrc: 'https://media.test/logo/320.webp',
        href: '/hosts/kettle-ridge-lodge',
        subscriber: true,
      },
      location: 'Breckenridge, CO',
      category: 'seasonal',
      boosted: false,
      starts: { label: 'Starts in 3 days' },
      endLabel: 'Ongoing',
      housing: { provided: true },
      meals: { provided: false },
      pay: { label: '$19/hr' },
      saved: false,
      applied: false,
    });
  });

  it('uses the 640 cover with a 3-width srcSet', () => {
    expect(toJobCardProps(card()).cover).toEqual({
      src: media(640),
      alt: 'The base lodge',
      srcSet: `${media(320)} 320w, ${media(640)} 640w, ${media(1280)} 1280w`,
    });
    expect(toJobCardProps(card({ cover: null })).cover).toBeNull();
  });

  it('maps saved, applied, boosted and the subscriber flag', () => {
    const p = toJobCardProps(
      card({
        viewer: { disposition: 'saved', applied: true },
        boosted: { boostId: 'b9' },
        host: { ...card().host, subscriberSince: null },
      }),
    );
    expect(p.saved).toBe(true);
    expect(p.applied).toBe(true);
    expect(p.boosted).toBe(true);
    expect(p.host.subscriber).toBe(false);
    expect(toJobCardProps(card({ viewer: { disposition: 'skipped', applied: false } })).saved).toBe(
      false,
    );
  });

  it('leaves the end segment out when there is none', () => {
    expect(toJobCardProps(card()).endLabel).toBeUndefined();
  });

  it('passes the handlers through', () => {
    const onSave = vi.fn();
    const p = toJobCardProps(card(), { onSave, hideActions: true, titleAs: 'h3' });
    expect(p.onSave).toBe(onSave);
    expect(p.hideActions).toBe(true);
    expect(p.titleAs).toBe('h3');
  });
});

describe('chipSheetContent', () => {
  it('lists the housing cost and note', () => {
    expect(chipSheetContent(card(), 'housing')).toEqual({
      title: 'Housing',
      lines: ['$150/week · deducted from pay', 'Shared room near the lift'],
      footer: {
        label: 'All housing details on the listing',
        href: `/jobs/view/${ID}/lift-operator?source=seek`,
      },
    });
  });

  it('leaves out a missing note', () => {
    const d = card({ housing: { provided: true, free: true, costLine: 'Free', note: null } });
    expect(chipSheetContent(d, 'housing').lines).toEqual(['Free']);
  });

  it('says when there is no housing or meals', () => {
    const d = card({ housing: { provided: false, free: false, costLine: null, note: null } });
    expect(chipSheetContent(d, 'housing').lines).toEqual(['No housing']);
    const meals = chipSheetContent(d, 'meals');
    expect(meals.lines).toEqual(['No meals']);
    expect(meals.footer.label).toBe('All meal details on the listing');
  });

  it('lists meals when provided', () => {
    const d = card({
      meals: { provided: true, free: false, costLine: '$10/day · paid directly', note: '3 a day' },
    });
    expect(chipSheetContent(d, 'meals').lines).toEqual(['$10/day · paid directly', '3 a day']);
  });

  it('lists the full pay line and its details', () => {
    expect(chipSheetContent(card(), 'pay')).toMatchObject({
      title: 'Pay',
      lines: ['$19/hr', 'Overtime available', 'Paid every 2 weeks'],
      footer: { label: 'All pay details on the listing' },
    });
  });
});
