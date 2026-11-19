import { describe, expect, it } from 'vitest';
import { fakeGithubStatus, makeFakeCheckDeps } from './launch-deps';
import { operatorPortsFake } from './operator-ports';

const CONSUMED = [
  'listReportsAbout',
  'refund',
  'extendTrial',
  'grantFreeAccount',
  'operatorChangePlan',
  'createCoupon',
  'createFoundingCodes',
  'grant',
  'suspendOrganization',
  'restoreOrganization',
  'stopPromotionsForOrg',
] as const;

describe('SP8 fakes', () => {
  it('does not throw not implemented for the ports later tasks consume', async () => {
    const fake = operatorPortsFake();
    await expect(fake.listReportsAbout()).resolves.toEqual([]);
    for (const name of CONSUMED) {
      if (name === 'listReportsAbout') continue;
      await expect(fake[name](), name).resolves.toBeUndefined();
    }
    expect(fake.calls.map((call) => call.method)).toEqual([...CONSUMED]);
  });

  it('returns the release sha and the newest matching run', async () => {
    const status = fakeGithubStatus({
      releaseSha: 'abc123',
      runs: [
        {
          workflow: 'release.yml',
          conclusion: 'success',
          headSha: 'old',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          workflow: 'release.yml',
          conclusion: 'failure',
          headSha: 'new',
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
        {
          workflow: 'other.yml',
          conclusion: 'success',
          headSha: 'other',
          createdAt: new Date('2026-03-01T00:00:00Z'),
        },
      ],
    });
    expect(await status.releaseSha()).toBe('abc123');
    expect(await status.latestRun({ workflow: 'release.yml' })).toMatchObject({ headSha: 'new' });
  });

  it('scans a probe image as a miss', async () => {
    await expect(makeFakeCheckDeps().childSafety.scanImage(new Uint8Array([1, 2, 3]))).resolves.toMatchObject({
      match: false,
    });
  });
});
