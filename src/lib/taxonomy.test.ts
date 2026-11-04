import { describe, expect, it } from 'vitest';
import { FEDERAL_MIN_WAGE_CENTS, MIN_WAGE_CENTS_2026 } from './min-wage';
import { CATEGORIES, GENRES, PERKS } from './taxonomy';
import { STATE_DEFAULT_TIMEZONE, US_STATE_CODES } from './us-states';

describe('US states', () => {
  it('lists the 50 states, DC and the five territories', () => {
    expect(US_STATE_CODES).toHaveLength(56);
    expect(new Set(US_STATE_CODES).size).toBe(56);
    for (const code of ['AK', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP', 'WY']) {
      expect(US_STATE_CODES).toContain(code);
    }
  });

  it('gives every state a default time zone that Intl accepts', () => {
    expect(Object.keys(STATE_DEFAULT_TIMEZONE).sort()).toEqual([...US_STATE_CODES].sort());
    for (const timeZone of Object.values(STATE_DEFAULT_TIMEZONE)) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone }), timeZone).not.toThrow();
    }
  });

  it('uses the most populous zone of multi-zone states', () => {
    expect(STATE_DEFAULT_TIMEZONE.AK).toBe('America/Anchorage');
    expect(STATE_DEFAULT_TIMEZONE.TX).toBe('America/Chicago');
    expect(STATE_DEFAULT_TIMEZONE.IN).toBe('America/Indiana/Indianapolis');
    expect(STATE_DEFAULT_TIMEZONE.GU).toBe('Pacific/Guam');
    expect(STATE_DEFAULT_TIMEZONE.AS).toBe('Pacific/Pago_Pago');
    expect(STATE_DEFAULT_TIMEZONE.MP).toBe('Pacific/Saipan');
    expect(STATE_DEFAULT_TIMEZONE.VI).toBe('America/St_Thomas');
    expect(STATE_DEFAULT_TIMEZONE.PR).toBe('America/Puerto_Rico');
    expect(STATE_DEFAULT_TIMEZONE.HI).toBe('Pacific/Honolulu');
  });
});

describe('taxonomy', () => {
  it('has the four categories', () => {
    expect(CATEGORIES).toEqual(['maritime', 'seasonal', 'farm', 'remote']);
  });

  it('lists the product genres with their labels', () => {
    const byCategory = (c: string) => GENRES.filter((g) => g.category === c).map((g) => g.label);
    expect(byCategory('maritime')).toEqual([
      'Commercial fishing',
      'Seafood processing',
      'Yachts',
      'Ferries and tours',
      'Expedition cruises',
      'Tugs and barges',
    ]);
    expect(byCategory('seasonal')).toEqual([
      'National parks',
      'Ski resorts',
      'Summer camps',
      'Guest ranches and lodges',
      'Festivals and events',
      'Adventure guiding',
    ]);
    expect(byCategory('farm')).toEqual([
      'Harvest',
      'Orchards and vineyards',
      'Livestock and ranch',
      'Dairy',
      'Greenhouse and nursery',
      'Organic',
    ]);
    expect(byCategory('remote')).toEqual([
      'Customer support',
      'Sales',
      'Software and IT',
      'Design and creative',
      'Writing',
      'Virtual assistant',
      'Teaching',
    ]);
    expect(GENRES).toHaveLength(25);
  });

  it('uses unique snake_case codes', () => {
    const codes = GENRES.map((g) => g.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z0-9_]+$/);
    expect(GENRES[0]).toEqual({
      code: 'commercial_fishing',
      label: 'Commercial fishing',
      category: 'maritime',
    });
    expect(GENRES.find((g) => g.code === 'ski_resorts')?.label).toBe('Ski resorts');
    expect(GENRES.at(-1)).toEqual({ code: 'teaching', label: 'Teaching', category: 'remote' });
  });

  it('lists the perks', () => {
    expect(PERKS.map((p) => p.code)).toEqual([
      'ski_pass',
      'park_pass',
      'employee_discounts',
      'shuttle',
      'laundry',
      'wifi',
      'gym',
      'end_of_season_bonus',
      'travel_reimbursement',
      'relocation_help',
      'health_insurance',
      'paid_time_off',
      'retirement_plan',
      'equipment_provided',
      'uniform_provided',
      'training_provided',
    ]);
    for (const perk of PERKS) expect(perk.label.length).toBeGreaterThan(0);
  });
});

describe('minimum wages', () => {
  it('covers every state with at least the federal rate', () => {
    expect(FEDERAL_MIN_WAGE_CENTS).toBe(725);
    expect(Object.keys(MIN_WAGE_CENTS_2026).sort()).toEqual([...US_STATE_CODES].sort());
    for (const [state, cents] of Object.entries(MIN_WAGE_CENTS_2026)) {
      expect(Number.isInteger(cents), state).toBe(true);
      expect(cents, state).toBeGreaterThanOrEqual(725);
    }
  });

  it('uses the federal rate where no higher state rate applies', () => {
    for (const state of ['AL', 'GA', 'TX', 'WY', 'PA', 'AS'] as const) {
      expect(MIN_WAGE_CENTS_2026[state], state).toBe(725);
    }
    expect(MIN_WAGE_CENTS_2026.WA).toBe(1713);
    expect(MIN_WAGE_CENTS_2026.CA).toBe(1690);
  });
});
