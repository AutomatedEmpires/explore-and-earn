import { describe, expect, it } from 'vitest';
import { makeFakeClerkAdmin } from './index';

describe('the fake ClerkAdmin (SP2 membership calls)', () => {
  it('records membership and organization calls', async () => {
    const clerk = makeFakeClerkAdmin();
    await clerk.addMembership('org_1', 'user_1', 'org:recruiter');
    await clerk.updateMembershipRole('org_1', 'user_1', 'org:admin');
    await clerk.removeMembership('org_1', 'user_1');
    await clerk.updateOrganization('org_1', { name: 'Kettle Ridge Lodge' });
    await clerk.deleteOrganization('org_1');

    expect(clerk.calls).toEqual([
      { method: 'addMembership', args: ['org_1', 'user_1', 'org:recruiter'] },
      { method: 'updateMembershipRole', args: ['org_1', 'user_1', 'org:admin'] },
      { method: 'removeMembership', args: ['org_1', 'user_1'] },
      { method: 'updateOrganization', args: ['org_1', { name: 'Kettle Ridge Lodge' }] },
      { method: 'deleteOrganization', args: ['org_1'] },
    ]);
  });

  it('keeps the memberships it was given', async () => {
    const clerk = makeFakeClerkAdmin();
    await clerk.addMembership('org_1', 'user_1', 'org:recruiter');
    await clerk.addMembership('org_1', 'user_2', 'org:billing');
    await clerk.updateMembershipRole('org_1', 'user_1', 'org:admin');
    await clerk.removeMembership('org_1', 'user_2');
    expect(clerk.memberships).toEqual([
      { clerkOrgId: 'org_1', clerkUserId: 'user_1', role: 'org:admin' },
    ]);
  });

  it('fails the next call when asked', async () => {
    const clerk = makeFakeClerkAdmin();
    clerk.failNext('addMembership');
    await expect(clerk.addMembership('org_1', 'user_1', 'org:recruiter')).rejects.toThrow();
    await expect(clerk.addMembership('org_1', 'user_1', 'org:recruiter')).resolves.toBeUndefined();
    expect(clerk.memberships).toHaveLength(1);
  });
});
