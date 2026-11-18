// Green-by-default stand-ins for the launch probes (Task 27).
import type { ChildSafetyScanner } from '@/modules/media';
import type { Db } from '@/lib/db';
import type { Env } from '@/lib/env';

export type GithubRun = {
  workflow: string;
  job?: string;
  conclusion: 'success' | 'failure';
  headSha: string;
  createdAt: Date;
  url?: string;
};

export type GithubStatus = {
  releaseSha(): Promise<string | null>;
  latestRun(i: {
    workflow: string;
    headSha?: string;
    job?: string;
    branch?: string;
  }): Promise<{ conclusion: GithubRun['conclusion'] | null; createdAt: Date; url: string; headSha: string } | null>;
};

export function fakeGithubStatus(o: { releaseSha: string | null; runs: GithubRun[] }): GithubStatus {
  return {
    async releaseSha() {
      return o.releaseSha;
    },
    async latestRun(i) {
      const matches = o.runs
        .filter((run) => run.workflow === i.workflow)
        .filter((run) => i.job === undefined || run.job === i.job)
        .filter((run) => i.headSha === undefined || run.headSha === i.headSha)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const run = matches[0];
      if (!run) return null;
      return {
        conclusion: run.conclusion,
        createdAt: run.createdAt,
        url: run.url ?? '',
        headSha: run.headSha,
      };
    },
  };
}

export type CheckDeps = {
  env: Env;
  db: Db;
  github: GithubStatus;
  stripe: {
    keyMode(): 'live' | 'test' | null;
    webhookEnabled(url: string): Promise<boolean>;
    smokeSubscriptionProcessed(): Promise<boolean>;
  };
  clerk: { keyMode(): 'live' | 'test' | null; domainVerified(): Promise<boolean> };
  resend: { domainVerified(domain: string): Promise<boolean> };
  dns: { txt(name: string): Promise<string[]> };
  sentry: {
    uptimeMonitorFor(url: string): Promise<boolean>;
    cronMonitorExists(slug: string): Promise<boolean>;
  };
  childSafety: ChildSafetyScanner;
  now: Date;
};

export type FakeCheckState = Partial<CheckDeps>;

export function makeFakeCheckDeps(o: FakeCheckState = {}): CheckDeps {
  return {
    env: {} as Env,
    db: {} as Db,
    github: fakeGithubStatus({ releaseSha: null, runs: [] }),
    stripe: {
      keyMode: () => 'live',
      webhookEnabled: async () => true,
      smokeSubscriptionProcessed: async () => true,
    },
    clerk: { keyMode: () => 'live', domainVerified: async () => true },
    resend: { domainVerified: async () => true },
    dns: { txt: async () => [] },
    sentry: { uptimeMonitorFor: async () => true, cronMonitorExists: async () => true },
    childSafety: { async scanImage() { return { match: false, provider: 'fake' }; } },
    now: new Date('2026-11-18T00:00:00Z'),
    ...o,
  };
}
