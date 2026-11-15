import { describe, expect, it } from 'vitest';
import {
  dollars,
  formatDay,
  formatPayAmount,
  money,
  parseMoney,
  parsePayAmount,
  parseWholeNumber,
  savedLabel,
} from './format';

describe('money', () => {
  it('drops cents when there are none and keeps two digits when there are', () => {
    expect(dollars(1800)).toBe('18');
    expect(dollars(1850)).toBe('18.50');
    expect(dollars(1_000_000)).toBe('10,000');
    expect(money(11000)).toBe('$110');
  });

  it('parses what a host types into cents', () => {
    expect(parseMoney('')).toBeUndefined();
    expect(parseMoney('  ')).toBeUndefined();
    expect(parseMoney('$110')).toBe(11000);
    expect(parseMoney('110.5')).toBe(11050);
    expect(parseMoney('1,250')).toBe(125000);
    expect(parseMoney('about 100')).toBeNull();
    expect(parseMoney('10.555')).toBeNull();
  });
});

describe('pay amount', () => {
  it('reads one amount as a fixed rate', () => {
    expect(parsePayAmount('18')).toEqual({ kind: 'fixed', minCents: 1800, maxCents: 1800 });
    expect(parsePayAmount('$18.50')).toEqual({ kind: 'fixed', minCents: 1850, maxCents: 1850 });
  });

  it('reads a range written with a dash, an en dash or "to"', () => {
    const range = { kind: 'range', minCents: 1800, maxCents: 2000 };
    expect(parsePayAmount('$18–$20')).toEqual(range);
    expect(parsePayAmount('18-20')).toEqual(range);
    expect(parsePayAmount('18 to 20')).toEqual(range);
    expect(parsePayAmount('$18 — $20')).toEqual(range);
  });

  it('keeps a range typed top first, for the validator to flag', () => {
    expect(parsePayAmount('22-18')).toEqual({ kind: 'range', minCents: 2200, maxCents: 1800 });
  });

  it('treats a range with equal ends as a fixed rate', () => {
    expect(parsePayAmount('18-18')).toEqual({ kind: 'fixed', minCents: 1800, maxCents: 1800 });
  });

  it('returns null for words and undefined for nothing', () => {
    expect(parsePayAmount('Good wages')).toBeNull();
    expect(parsePayAmount('18-')).toBeNull();
    expect(parsePayAmount('')).toBeUndefined();
  });

  it('formats a range with an en dash and no spaces', () => {
    expect(formatPayAmount({ kind: 'range', minCents: 1800, maxCents: 2000 })).toBe('$18–$20');
    expect(formatPayAmount({ kind: 'fixed', minCents: 1850, maxCents: 1850 })).toBe('$18.50');
  });
});

describe('whole numbers', () => {
  it('accepts digits only', () => {
    expect(parseWholeNumber('3')).toBe(3);
    expect(parseWholeNumber(' 40 ')).toBe(40);
    expect(parseWholeNumber('')).toBeUndefined();
    expect(parseWholeNumber('2.5')).toBeNull();
    expect(parseWholeNumber('three')).toBeNull();
  });
});

describe('dates and times', () => {
  it('writes a YYYY-MM-DD date the way the cards do', () => {
    expect(formatDay('2027-05-18')).toBe('May 18, 2027');
    expect(formatDay('not a date')).toBe('not a date');
  });

  it('labels the last save with the local time', () => {
    const at = new Date(2027, 4, 18, 18, 14);
    expect(savedLabel(at)).toBe('Saved 6:14 PM');
  });
});
