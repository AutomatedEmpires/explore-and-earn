import { describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/modules/identity';
import { threadViewer } from './thread-viewer';

const host: CurrentUser = {
  id: '22222222-2222-4222-8222-222222222222',
  clerkUserId: 'user_host',
  accountType: 'host',
  email: null,
};
const ctx = { user: host, orgId: '33333333-3333-4333-8333-333333333333', role: 'owner' as const };

vi.mock('@/server/guards', () => ({
  requireHost: vi.fn(async () => ctx),
}));

describe('threadViewer', () => {
  it('reads a host through requireHost and refuses an operator', async () => {
    await expect(threadViewer(host)).resolves.toEqual({ kind: 'host', ctx });
    const seeker: CurrentUser = { ...host, id: '44444444-4444-4444-8444-444444444444', accountType: 'seeker' };
    await expect(threadViewer(seeker)).resolves.toEqual({ kind: 'seeker', userId: seeker.id });
    const operator: CurrentUser = { ...host, accountType: 'operator' };
    await expect(threadViewer(operator)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
