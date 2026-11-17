import { describe, expect, it } from 'vitest';
import { forbidden } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { applicationsFake, profilesFake, resetApplications, resetProfiles, resetSafety, safetyFake } from './sp4';
import { discoveryFake, resetDiscovery } from './sp3';
import { entitlementsFake, hostpagesFake, listingsFake, orgsFake, resetEntitlements, resetHostpages, resetListings, resetOrgs } from './sp2';
import { messagingFake, resetMessaging } from './messaging';

const fakes = [listingsFake, orgsFake, entitlementsFake, hostpagesFake, discoveryFake, applicationsFake, profilesFake, safetyFake, messagingFake];

async function noStub(name: string, fn: (...args: never[]) => unknown): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Error && err.message.includes('not implemented')) {
      throw new Error(`${name} fell through to a stub: ${err.message}`);
    }
  }
}

describe('SP5 fakes', () => {
  it('has no function that throws not implemented', async () => {
    resetListings();
    resetOrgs();
    resetEntitlements();
    resetHostpages();
    resetDiscovery();
    resetApplications();
    resetProfiles();
    resetSafety();
    resetMessaging();
    for (const fake of fakes) {
      for (const [name, value] of Object.entries(fake)) {
        if (typeof value === 'function') await noStub(name, value as (...args: never[]) => unknown);
      }
    }
  });

  it('enforces application transitions and a stale from', async () => {
    const id = newId();
    const orgId = newId();
    const seekerUserId = newId();
    applicationsFake.seedApplication({ id, orgId, seekerUserId, status: 'new' });
    await expect(
      applicationsFake.setStatus(null as never, {
        applicationId: id,
        from: ['new'],
        to: 'shortlisted',
        actor: { type: 'seeker', userId: seekerUserId },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(forbidden().code).toBe('forbidden');
    applicationsFake.seedApplication({ id, orgId, seekerUserId, status: 'withdrawn' });
    await expect(
      applicationsFake.setStatus(null as never, {
        applicationId: id,
        from: ['new'],
        to: 'shortlisted',
        actor: { type: 'host', userId: newId(), orgId },
      }),
    ).resolves.toEqual({ ok: false, current: 'withdrawn' });
  });

  it('refuses a credit spend at balance 0', async () => {
    const orgId = newId();
    entitlementsFake.setCredits(orgId, 0);
    await expect(
      entitlementsFake.consume(null as never, {
        orgId,
        kind: 'invite_credit',
        subjectType: 'invite',
        subjectId: newId(),
        idempotencyKey: newId(),
        actor: { type: 'system', id: null },
      }),
    ).resolves.toEqual({ ok: false, reason: 'insufficient', remaining: 0 });
  });

  it('maps scam markers on host text', async () => {
    const base = { subjectType: 'invite' as const, subjectId: newId(), orgId: newId() };
    await expect(messagingFake.scanHostText(null as never, { ...base, text: 'pay __block__' })).resolves.toMatchObject({
      state: 'held',
    });
    await expect(messagingFake.scanHostText(null as never, { ...base, text: 'see __flag__' })).resolves.toMatchObject({
      state: 'warn',
    });
    await expect(messagingFake.scanHostText(null as never, { ...base, text: 'hello' })).resolves.toMatchObject({
      state: 'clear',
    });
  });
});
