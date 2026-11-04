import { describe, expect, it, vi } from 'vitest';
import { chipSheetContent, toJobCardProps } from './card-props';
import type { JobCardData } from './types';

const media = (id: string, w: 320 | 640 | 1280) => `https://media.test/${id}/${w}.webp`;

function card(o: Partial<JobCardData> = {}): JobCardData {
  return {
    listingId: '0190a3d2-0000-7000-8000-000000000001',
    href: '/jobs/view/0190a3d2-0000-7000-8000-000000000001/lift-operator?source=seek',
    title: 'Lift operator',
    category: 'seasonal',
    secondaryCategory: null,
    genre: 'ski-resorts',
    status: 'active',
    remote: false,
    locationLabel: 'Breckenridge, CO',
    host: {
      orgId: '0190a3d2-0000-7000-8000-0000000000aa',
      name: 'Kettle Ridge Lodge',
      slug: 'kettle-ridge-lodge',
      logoUrl: 'https://media.test/logo/320.webp',
      subscriberSince: '2026-03-01',
    },
    cover: {
      src: { 320: media('cover', 320), 640: media('cover', 640), 1280: media('cover', 1280) },
      alt: 'The lift at sunrise',
    },
    dateLine: { info: 'Begins Dec 1', end: 'Ends Apr 15, 2027' },
    housing: {
      provided: true,
      free: false,
      costLine: '$150/week · deducted from pay',
      note: 'Shared staff cabin, a 5-minute walk to the lift.',
    },
    meals: { provided: false, free: false, costLine: null, note: null },
    pay: {
      chip: '$19/hr',
      full: '$19/hr',
      details: ['Overtime available', 'Paid every 2 weeks'],
    },
    sponsorsVisas: false,
    boosted: { boostId: 'b9' },
    viewer: { disposition: 'saved', applied: false },
    ...o,
  };
}

describe('toJobCardProps', () => {
  it('maps the card data onto the JobCard props', () => {
    const onSave = vi.fn();
    const props = toJobCardProps(card(), { onSave, titleAs: 'h3' });
    expect(props).toMatchObject({
      href: card().href,
      position: 'Lift operator',
      location: 'Breckenridge, CO',
      category: 'seasonal',
      host: {
        name: 'Kettle Ridge Lodge',
        logoSrc: 'https://media.test/logo/320.webp',
        href: '/hosts/kettle-ridge-lodge',
        subscriber: true,
      },
      pay: { label: '$19/hr' },
      starts: { label: 'Begins Dec 1' },
      endLabel: 'Ends Apr 15, 2027',
      housing: { provided: true },
      meals: { provided: false },
      saved: true,
      applied: false,
      boosted: true,
      titleAs: 'h3',
    });
    expect(props.onSave).toBe(onSave);
    expect(props.cover).toEqual({
      src: media('cover', 640),
      srcSet: `${media('cover', 320)} 320w, ${media('cover', 640)} 640w, ${media('cover', 1280)} 1280w`,
      alt: 'The lift at sunrise',
    });
  });

  it('handles a guest, no boost, no subscriber, no cover and an open end', () => {
    const props = toJobCardProps(
      card({
        viewer: null,
        boosted: null,
        cover: null,
        dateLine: { info: 'Summer 2027', end: null },
        host: { ...card().host, subscriberSince: null, logoUrl: null },
      }),
      {},
    );
    expect(props.saved).toBe(false);
    expect(props.applied).toBe(false);
    expect(props.boosted).toBe(false);
    expect(props.host.subscriber).toBe(false);
    expect(props.host.logoSrc).toBeNull();
    expect(props.cover).toBeNull();
    expect(props.endLabel).toBeUndefined();
  });

  it('marks an applied listing and a skipped one as not saved', () => {
    const props = toJobCardProps(card({ viewer: { disposition: 'skipped', applied: true } }));
    expect(props.saved).toBe(false);
    expect(props.applied).toBe(true);
  });
});

describe('chipSheetContent', () => {
  it('opens housing with the cost line and the note', () => {
    expect(chipSheetContent(card(), 'housing')).toEqual({
      title: 'Housing',
      lines: ['$150/week · deducted from pay', 'Shared staff cabin, a 5-minute walk to the lift.'],
      footer: { label: 'All housing details on the listing', href: card().href },
    });
  });

  it('says "No housing" and "No meals" when there are none', () => {
    const none = { provided: false, free: false, costLine: null, note: null };
    expect(chipSheetContent(card({ housing: none }), 'housing').lines).toEqual(['No housing']);
    expect(chipSheetContent(card(), 'meals')).toEqual({
      title: 'Meals',
      lines: ['No meals'],
      footer: { label: 'All meal details on the listing', href: card().href },
    });
  });

  it('leaves out a missing note', () => {
    const meals = { provided: true, free: true, costLine: 'Free', note: null };
    expect(chipSheetContent(card({ meals }), 'meals').lines).toEqual(['Free']);
  });

  it('opens pay with the full amount, then the detail lines', () => {
    expect(chipSheetContent(card(), 'pay')).toEqual({
      title: 'Pay',
      lines: ['$19/hr', 'Overtime available', 'Paid every 2 weeks'],
      footer: { label: 'All pay details on the listing', href: card().href },
    });
  });
});
