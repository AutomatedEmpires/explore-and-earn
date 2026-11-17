import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyticsQuerySchema } from '@/lib/host-analytics';
import {
  applicantsQuerySchema,
  applicationParamSchema,
  candidatesQuerySchema,
  interviewProposalSchema,
  offerInputSchema,
  requestTimesSchema,
  sendInviteSchema,
  shortlistSchema,
} from './schemas';
import { idParamSchema, sendMessageSchema } from '@/lib/messaging';

const UUID = '11111111-1111-4111-8111-111111111111';
const START = '2027-06-01T16:00:00.000Z';

describe('hiring schemas', () => {
  it('counts code points and rejects control characters', () => {
    expect(sendMessageSchema.safeParse({ clientId: 'c', body: '😀'.repeat(4000) }).success).toBe(true);
    expect(sendMessageSchema.safeParse({ clientId: 'c', body: '😀'.repeat(4001) }).success).toBe(false);
    expect(sendInviteSchema.safeParse({ candidateId: UUID, note: 'a'.repeat(300) }).success).toBe(true);
    expect(sendInviteSchema.safeParse({ candidateId: UUID, note: 'a'.repeat(301) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ clientId: 'c', body: 'hello\u0007' }).success).toBe(false);
  });

  it('checks interview, offer, pool and applicant limits, and fills defaults', () => {
    const phone = { slots: [{ start: START }], format: 'phone' as const };
    expect(interviewProposalSchema.parse(phone)).toMatchObject({ durationMinutes: 30, expiryHours: 72 });
    expect(interviewProposalSchema.safeParse({ ...phone, slots: [] }).success).toBe(false);
    expect(
      interviewProposalSchema.safeParse({ ...phone, slots: Array.from({ length: 6 }, () => ({ start: START })) }).success,
    ).toBe(false);
    expect(interviewProposalSchema.safeParse({ ...phone, durationMinutes: 20 }).success).toBe(false);
    expect(interviewProposalSchema.safeParse({ slots: [{ start: START }], format: 'video' }).success).toBe(false);
    expect(
      interviewProposalSchema.safeParse({
        slots: [{ start: START }],
        format: 'video',
        videoUrl: 'http://x.test',
      }).success,
    ).toBe(false);
    expect(interviewProposalSchema.safeParse({ slots: [{ start: START }], format: 'in_person' }).success).toBe(false);
    expect(
      requestTimesSchema.safeParse({
        windows: Array.from({ length: 4 }, () => ({ start: START, end: '2027-06-01T17:00:00.000Z' })),
      }).success,
    ).toBe(false);
    expect(
      requestTimesSchema.safeParse({
        windows: [{ start: START, end: '2027-06-01T16:20:00.000Z' }],
      }).success,
    ).toBe(false);
    expect(
      offerInputSchema.safeParse({
        position: 'p'.repeat(121),
        startDate: '2027-06-01',
        pay: { amountCents: 2000, unit: 'hour' },
      }).success,
    ).toBe(false);
    expect(
      offerInputSchema.safeParse({
        startDate: '2027-06-01',
        pay: { amountCents: 2000, maxCents: 1000, unit: 'hour' },
      }).success,
    ).toBe(false);
    expect(candidatesQuerySchema.safeParse({ skills: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
    expect(applicantsQuerySchema.parse({})).toMatchObject({ sort: 'newest', limit: 25 });
    expect(applicantsQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('keeps path ids and body refinements when the schemas are merged', () => {
    expect(shortlistSchema.safeExtend(applicationParamSchema.shape).parse({ on: true, applicationId: UUID })).toEqual({
      on: true,
      applicationId: UUID,
    });
    expect(sendMessageSchema.safeExtend(idParamSchema.shape).safeParse({ clientId: 'c', id: UUID }).success).toBe(
      false,
    );
    expect(() => idParamSchema.parse({ id: 'abc' })).toThrow();
  });

  it('imports no server module, and the analytics schema resolves', () => {
    const banned = /^import (?!type).*from '(@\/modules\/|@\/lib\/db|drizzle-orm)/;
    for (const dir of ['src/lib/hiring', 'src/lib/messaging', 'src/lib/host-analytics']) {
      for (const file of walk(dir)) {
        for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
          expect(line, file).not.toMatch(banned);
        }
      }
    }
    expect(statSync('src/lib/analytics.ts').isFile()).toBe(true);
    expect(() => statSync('src/lib/analytics')).toThrow();
    expect(analyticsQuerySchema.parse({ range: '7d', tz: 'America/Denver' }).range).toBe('7d');
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) out.push(...walk(file));
    else if (file.endsWith('.ts')) out.push(file);
  }
  return out;
}
