import { describe, expect, it } from 'vitest';
import { FRAUD_RULES, matchHostFraud, type HostFraudInput } from './fraud-rules';

const NOW = new Date('2026-11-17T12:00:00.000Z');
const OLD = new Date('2024-01-01T00:00:00.000Z');
const RECENT = new Date('2026-11-10T12:00:00.000Z');

const LONG_A =
  'Cook dinner service for a forty seat dining room. Prep vegetables, grill fish, plate desserts, and close the kitchen. The crew works five evenings and one brunch. Housing is a shared cabin a short walk from the lodge.';
const LONG_B =
  'Guide overnight backpacking trips on the north trail. Carry the group gear, teach map reading, cook camp meals, and file a trip report after every return. The season runs from June through September with two days off each week.';

function input(over: Partial<HostFraudInput> = {}): HostFraudInput {
  return {
    bodyText: LONG_A,
    housingText: 'Housing: cabin, free',
    photoIds: ['11111111-1111-4111-8111-111111111111'],
    orgId: 'org-a',
    orgCreatedAt: OLD,
    now: NOW,
    peers: [],
    ...over,
  };
}

describe('matchHostFraud', () => {
  it('finds nothing in an ordinary listing, and never returns an approval', () => {
    const matches = matchHostFraud(input());
    expect(matches).toEqual([]);
    expect(matches.every((match) => FRAUD_RULES.includes(match.rule))).toBe(true);
    expect(JSON.stringify(matches)).not.toContain('approved');
  });

  it('flags pay-to-apply wording and ignores a denial or a housing-only deposit', () => {
    expect(matchHostFraud(input({ bodyText: `${LONG_A} Applicants pay a $50 application fee.` }))).toEqual([
      {
        rule: 'pay_to_apply',
        reason: expect.stringContaining('fee'),
      },
    ]);
    expect(
      matchHostFraud(input({ bodyText: `${LONG_A} Paid training is required before the first shift.` })).map(
        (match) => match.rule,
      ),
    ).toEqual(['pay_to_apply']);
    expect(
      matchHostFraud(input({ bodyText: `${LONG_A} There is no application fee and no deposit.` })),
    ).toEqual([]);
    expect(
      matchHostFraud(
        input({
          bodyText: LONG_A,
          housingText: 'Housing note: a refundable housing deposit of $200 is due at move-in.',
        }),
      ),
    ).toEqual([]);
  });

  it('flags off-platform payment requests and ignores a warning not to use them', () => {
    expect(
      matchHostFraud(input({ bodyText: `${LONG_A} Send the deposit by Venmo or a wire transfer.` })).map(
        (match) => match.rule,
      ),
    ).toContain('off_platform_payment');
    expect(
      matchHostFraud(input({ bodyText: `${LONG_A} Do not send gift cards, crypto, or a wire transfer.` })),
    ).toEqual([]);
  });

  it('flags a deposit that appears only in a message', () => {
    const flagged = matchHostFraud(
      input({
        messageText: 'Before I can hold the room, send a $300 deposit.',
        housingText: 'Housing: cabin, free',
      }),
    );
    expect(flagged.map((match) => match.rule)).toEqual(['deposit_only_in_messages']);
    expect(
      matchHostFraud(
        input({
          messageText: 'The housing deposit is the $200 listed on the job.',
          housingText: 'Housing note: refundable deposit of $200.',
        }),
      ),
    ).toEqual([]);
    expect(
      matchHostFraud(input({ messageText: 'No deposit is required to apply.', housingText: '' })),
    ).toEqual([]);
  });

  it('flags near-copies and shared photos across organizations, not the same organization', () => {
    const peer = {
      orgId: 'org-b',
      orgCreatedAt: OLD,
      text: LONG_A,
      photoIds: ['22222222-2222-4222-8222-222222222222'],
    };
    expect(matchHostFraud(input({ peers: [peer] })).map((match) => match.rule)).toEqual([
      'duplicate_listing',
    ]);
    expect(
      matchHostFraud(
        input({
          bodyText: LONG_B,
          peers: [{ ...peer, photoIds: ['11111111-1111-4111-8111-111111111111'] }],
        }),
      ).map((match) => match.rule),
    ).toEqual(['duplicate_listing']);
    expect(matchHostFraud(input({ peers: [{ ...peer, orgId: 'org-a' }] }))).toEqual([]);
    expect(matchHostFraud(input({ bodyText: LONG_B, peers: [peer] }))).toEqual([]);
  });

  it('names a new account when one side of a copy was created recently', () => {
    const [match] = matchHostFraud(
      input({
        orgCreatedAt: RECENT,
        peers: [
          {
            orgId: 'org-b',
            orgCreatedAt: OLD,
            text: LONG_A,
            photoIds: [],
          },
        ],
      }),
    );
    expect(match?.rule).toBe('duplicate_listing');
    expect(match?.reason).toContain('new');
  });
});
