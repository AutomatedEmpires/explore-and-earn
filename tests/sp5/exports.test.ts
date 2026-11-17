// These imports are the internals the public indexes must not re-export.
/* eslint-disable no-restricted-imports */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { seedSeeker } from '../helpers/sp2';
import * as analytics from '@/modules/analytics';
import * as hiring from '@/modules/hiring';
import * as messaging from '@/modules/messaging';
import { getType } from '@/modules/notifications';
import { getCounts } from '@/server/counts';
import { FIT_WEIGHTS, FIT_WEIGHTS_VERSION } from '@/modules/hiring/fit/weights';
import { closeOpenItems } from '@/modules/hiring/interviews/close';
import { openAsDescribed } from '@/modules/hiring/as-described/open';
import { sweepInterviews } from '@/modules/hiring/interviews/sweep';
import { sweepInvites } from '@/modules/hiring/invites/sweep';
import { loadInviteNote, releaseInviteNote } from '@/modules/hiring/invites/notes';
import { loadInterviewNote, releaseInterviewNote } from '@/modules/hiring/interviews/notes';
import { loadOfferNote, releaseOfferNote } from '@/modules/hiring/offers/notes';
import { transitionStatus, mirrorStatus, recordPipelineEvent } from '@/modules/hiring/core';
import { requireEntry, requireListing } from '@/modules/hiring/access';
import { enqueueNoteScan, runNoteScan } from '@/modules/hiring/notes';

const PUBLIC = [
  'shortlist',
  'markHired',
  'pass',
  'undoPass',
  'listApplicants',
  'getApplicantDetail',
  'getHostHome',
  'getOrgHiringSummary',
  'computeFit',
  'sendInvite',
  'listSeekerInvites',
  'proposeInterview',
  'listSeekerInterviews',
  'sendOffer',
  'listSeekerOffers',
  'pendingInboxCount',
  'getAsDescribedSummary',
  'getCardPayloads',
] as const;

describe('SP5 exports', () => {
  it('exports the public functions and keeps the pipeline internals off the index', () => {
    for (const name of PUBLIC) expect(typeof hiring[name]).toBe('function');
    for (const name of [
      'ensureThread',
      'postCard',
      'postEvent',
      'sendHostMessage',
      'scanHostText',
      'unreadThreadCount',
      'getReplyStats',
      'listingScope',
      'inScope',
      'listingTeam',
      'requireHiringCapability',
    ] as const) {
      expect(typeof messaging[name]).toBe('function');
    }
    for (const name of ['resolveRange', 'getHostAnalytics', 'toAnalyticsCsv', 'getBoostWindows'] as const) {
      expect(typeof analytics[name]).toBe('function');
    }
    const hidden = {
      transitionStatus,
      mirrorStatus,
      recordPipelineEvent,
      requireListing,
      requireEntry,
      enqueueNoteScan,
      runNoteScan,
      closeOpenItems,
      openAsDescribed,
      sweepInvites,
      sweepInterviews,
      loadInviteNote,
      releaseInviteNote,
      loadInterviewNote,
      releaseInterviewNote,
      loadOfferNote,
      releaseOfferNote,
    };
    for (const name of Object.keys(hidden)) expect(name in hiring).toBe(false);
    for (const fn of Object.values(hidden)) expect(typeof fn).toBe('function');
  });

  it('ships the spec 8.3 weights and version', () => {
    for (const weights of Object.values(FIT_WEIGHTS)) {
      expect(Object.values(weights).reduce((sum, n) => sum + n, 0)).toBe(100);
    }
    expect(FIT_WEIGHTS).toEqual({
      maritime: { occupation: 20, availability: 20, skills: 15, certifications: 20, work_authorization: 10, pay: 5, location: 10 },
      seasonal: { occupation: 20, availability: 30, skills: 15, certifications: 5, work_authorization: 10, pay: 10, location: 10 },
      farm: { occupation: 20, availability: 30, skills: 20, certifications: 5, work_authorization: 10, pay: 5, location: 10 },
      remote: { occupation: 25, availability: 15, skills: 25, certifications: 5, work_authorization: 10, pay: 10, location: 10 },
    });
    expect(FIT_WEIGHTS_VERSION).toBe(
      'fit_weights@' + createHash('sha256').update(JSON.stringify(FIT_WEIGHTS)).digest('hex').slice(0, 8),
    );
    expect(hiring.FIT_WEIGHTS_VERSION).toBe(FIT_WEIGHTS_VERSION);
  });

  it('defines the 17 notification types and the message paths', () => {
    const types = [
      ['messages.new', 'messages', true],
      ['hiring.invite_received', 'applications', true],
      ['hiring.invite_expiring', 'applications', false],
      ['hiring.invite_response', 'applications', true],
      ['hiring.interview_invited', 'applications', true],
      ['hiring.interview_scheduled', 'applications', true],
      ['hiring.interview_times_requested', 'applications', true],
      ['hiring.interview_declined', 'applications', true],
      ['hiring.interview_canceled', 'applications', true],
      ['hiring.interview_expired', 'applications', false],
      ['hiring.interview_reminder_24h', 'applications', true],
      ['hiring.interview_reminder_1h', 'applications', true],
      ['hiring.interview_outcome_due', 'applications', false],
      ['hiring.offer_received', 'applications', true],
      ['hiring.offer_response', 'applications', true],
      ['hiring.marked_hired', 'applications', true],
      ['hiring.as_described_prompt', 'applications', true],
    ] as const;
    for (const [type, category, push] of types) {
      expect(getType(type), type).toMatchObject({ category, ...(push ? { push: true } : {}) });
      if (!push) expect(getType(type)?.push).toBeUndefined();
    }
    expect(getType('messages.new')?.url?.({ audience: 'seeker', threadId: 't' })).toBe('/inbox/t');
    expect(getType('messages.new')?.url?.({ audience: 'host', threadId: 't' })).toBe('/host/messages/t');
    expect(getType('messages.new')?.email?.digestAction).toBe('Reply in app');
  });

  it('gives each module its own tables', () => {
    expect(hiring.privacyHandler.module).toBe('hiring');
    expect(messaging.privacyHandler.module).toBe('messaging');
    expect(analytics.privacyHandler.module).toBe('analytics');
    expect([...hiring.privacyHandler.tables]).toEqual([
      'pipeline_entries',
      'pipeline_events',
      'pending_passes',
      'candidate_pool_runs',
      'candidate_pool_entries',
      'invites',
      'interviews',
      'interview_slots',
      'offers',
      'as_described_responses',
    ]);
    expect([...messaging.privacyHandler.tables]).toEqual([
      'threads',
      'messages',
      'thread_reads',
      'saved_replies',
      'bulk_messages',
      'org_reply_stats',
    ]);
    expect([...analytics.privacyHandler.tables]).toEqual([]);
    const all = [...hiring.privacyHandler.tables, ...messaging.privacyHandler.tables];
    expect(new Set(all).size).toBe(all.length);
  });

  it('counts a new seeker as an empty inbox and calls a registered boost source', async () => {
    const t: TestDb = await createTestDb();
    try {
      const { userId } = await seedSeeker(t.db);
      expect(await getCounts(t.db, userId)).toMatchObject({ inbox: 0 });
    } finally {
      await t.close();
    }
    let seen = false;
    analytics.registerBoostWindowsSource(async () => {
      seen = true;
      return [];
    });
    await analytics.getBoostWindows(null as never, {
      orgId: 'o',
      from: new Date(0),
      to: new Date(0),
    });
    expect(seen).toBe(true);
  });
});
