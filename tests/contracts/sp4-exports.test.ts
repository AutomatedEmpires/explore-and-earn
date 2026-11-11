// SP4's module contract (SP4 plan Task 4): every function the spec (3.2) and the plan name is on
// its module's index from W0 on, the client-safe libs stay client-safe, and the copy the spec
// quotes is verbatim. Phase B replaces the stubs behind these names without changing them.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as applications from '@/modules/applications';
import * as profiles from '@/modules/profiles';
import * as safety from '@/modules/safety';
import { mayaApplicationSnapshot } from '@tests/fixtures/sp4/snapshot';

const PROFILES_FUNCTIONS = [
  // Spec 3.2
  'getOwnProfile',
  'buildProfileSnapshot',
  'queryPoolCandidates',
  'getCandidateCards',
  'getFitInputs',
  'grantReveal',
  'getCommunityIdentities',
  'getPreferenceTargets',
  'resolveAvailability',
  'missingItem',
  'needsAttention',
  'renderResumePdf',
  // Plan Task 4
  'updateProfile',
  'setAvailability',
  'confirmAvailability',
  'availabilitySweep',
  'addEntry',
  'updateEntry',
  'deleteEntry',
  'reorderEntries',
  'setSkills',
  'resumePdfResponse',
  'createImport',
  'getImport',
  'cancelImport',
  'mergeImport',
  'revokeAiConsent',
  'expireImports',
  'writingHelp',
  // The lib's other pure rules (plan File Structure)
  'confirmedDaysAgo',
  'formatAvailableFrom',
  'checkClientToday',
] as const;

const APPLICATIONS_FUNCTIONS = [
  // Spec 3.2
  'submitApplication',
  'seekerStatus',
  'setStatus',
  'withdraw',
  'getHostCards',
  'getSnapshot',
  'countApplicationsSince',
  // Plan Task 4
  'getApplyContext',
  'canTransition',
  'withdrawOpenForOrg',
  'setAdditionalStep',
  'listMyApplications',
  'getReceipt',
  'authorizeHostApplication',
  'getHostApplication',
] as const;

const SAFETY_FUNCTIONS = [
  // Spec 3.2
  'report',
  'registerReportSubject',
  'block',
  'unblock',
  'isBlockedBetween',
  'getRelationships',
  'getBlockSet',
  'mute',
  'unmute',
  'listReportsAbout',
  // Plan Task 4
  'unblockById',
  'listBlocks',
  'blockedUserIdsForOrg',
  'listMutes',
] as const;

function exported(mod: object, name: string): unknown {
  return (mod as Record<string, unknown>)[name];
}

describe('module indexes', () => {
  it.each(PROFILES_FUNCTIONS)('profiles exports %s', (name) => {
    expect(typeof exported(profiles, name)).toBe('function');
  });

  it.each(APPLICATIONS_FUNCTIONS)('applications exports %s', (name) => {
    expect(typeof exported(applications, name)).toBe('function');
  });

  it.each(SAFETY_FUNCTIONS)('safety exports %s', (name) => {
    expect(typeof exported(safety, name)).toBe('function');
  });

  it('has no upload-as-resume hooks (FD-2: the uploaded file is an import source only)', () => {
    expect(exported(profiles, 'markImportSourceInUse')).toBeUndefined();
    expect(exported(profiles, 'registerResumeMediaReferences')).toBeUndefined();
  });

  it('defines the transition table for every status', () => {
    expect(applications.TRANSITIONS).toBeDefined();
    expect(Object.keys(applications.TRANSITIONS).sort()).toEqual(
      [...applications.APPLICATION_STATUSES].sort(),
    );
  });

  it('exports each rate limit as a 24-hour window', () => {
    expect(profiles.RATE_LIMITS.aiImport).toEqual({
      key: 'ai_import',
      limit: 5,
      windowSec: 86_400,
    });
    expect(profiles.RATE_LIMITS.writingHelp).toEqual({
      key: 'writing_help',
      limit: 30,
      windowSec: 86_400,
    });
    expect(applications.RATE_LIMITS.apply).toEqual({ key: 'apply', limit: 30, windowSec: 86_400 });
    expect(safety.RATE_LIMITS.reports).toEqual({ key: 'reports', limit: 20, windowSec: 86_400 });
  });
});

describe('privacy registrations', () => {
  it('names each module and the tables it owns', () => {
    expect(profiles.privacyHandler.module).toBe('profiles');
    expect(profiles.privacyHandler.tables).toEqual([
      'seeker_profiles',
      'seeker_experiences',
      'seeker_education',
      'seeker_skills',
      'seeker_certifications',
      'seeker_reveals',
      'resume_imports',
    ]);
    expect(applications.privacyHandler.module).toBe('applications');
    expect(applications.privacyHandler.tables).toEqual(['applications', 'application_events']);
    expect(safety.privacyHandler.module).toBe('safety');
    expect(safety.privacyHandler.tables).toEqual(['reports', 'blocks', 'mutes']);
  });

  it('exports a retention rule list from every module', () => {
    for (const mod of [profiles, applications, safety]) {
      expect(Array.isArray(mod.retentionRules)).toBe(true);
    }
  });
});

describe('read stubs', () => {
  // Phase B workstreams call each other's reads before the owner lands them (plan "Cross-workstream
  // calls"), so the stubs answer with neutral values instead of throwing.
  const db = {} as never;

  it('say nobody is blocked or muted', async () => {
    const a = { type: 'user', id: 'u1' } as const;
    const b = { type: 'org', id: 'o1' } as const;
    expect(await safety.isBlockedBetween(db, a, b)).toEqual({
      blocked: false,
      byA: false,
      byB: false,
    });
    expect(await safety.getRelationships(db, { orgId: 'o1', seekerUserIds: ['u1'] })).toEqual([
      { seekerUserId: 'u1', blocked: false, muted: false },
    ]);
    expect(await safety.getBlockSet(db, 'u1')).toEqual({
      userIds: [],
      orgIds: [],
      mutedOrgIds: [],
    });
    expect(await safety.listBlocks(db, a)).toEqual([]);
    expect(await safety.listMutes(db, 'u1')).toEqual([]);
    expect(await safety.blockedUserIdsForOrg(db, 'o1')).toEqual([]);
  });

  it('say nothing needs attention and nothing was applied', async () => {
    expect(await profiles.needsAttention(db, 'u1')).toBe(false);
    expect(await profiles.getCommunityIdentities(db, ['u1'])).toEqual(new Map());
    expect(await profiles.getPreferenceTargets(db, 'u1')).toEqual({ categories: [], states: [] });
    expect(await applications.countApplicationsSince(db, new Date())).toBe(0);
  });

  it('throw a named error from everything else', async () => {
    await expect(profiles.getOwnProfile(db, 'u1')).rejects.toThrow(
      'not implemented: getOwnProfile',
    );
  });
});

describe('copy', () => {
  it('quotes the six missing-item lines verbatim (spec 8.3)', () => {
    expect(profiles.MISSING_ITEM_LINES).toEqual({
      name: 'Add your name so hosts can find you',
      location: 'Add your general location so hosts can find you',
      availability: 'Add your availability so hosts can find you',
      availability_stale: 'Confirm your availability so hosts can find you',
      category: 'Add a job category or occupation so hosts can find you',
      work_authorization: 'Add your work authorization so hosts can find you',
    });
  });

  it('quotes the consent and the apply dialogs verbatim (spec 7 and 8.6)', () => {
    expect(profiles.AI_CONSENT_TEXT).toBe(
      "We'll send this file to our AI provider, Anthropic, to fill in your profile. It isn't used to train AI. You review every field before anything is saved.",
    );
    expect(applications.SPONSORSHIP_PROMPT).toBe("This host doesn't sponsor visas. Apply anyway?");
    expect(applications.LISTING_CHANGED_PROMPT).toBe(
      'This listing changed while you were applying. Review the changes before you submit.',
    );
    expect(applications.youBlocked('Kettle Ridge Lodge')).toBe(
      'You blocked Kettle Ridge Lodge. Unblock to apply.',
    );
    expect(safety.REPORT_THANKS).toBe('Thanks. We review every report.');
  });
});

describe('schemas', () => {
  it('discriminate entries by the section route param', () => {
    const exp = profiles.entryCreateSchema.safeParse({
      section: 'experience',
      employer: 'Kettle Ridge Lodge',
      title: 'Deckhand',
      startMonth: '2024-05',
      endMonth: '2024-09',
    });
    expect(exp.success).toBe(true);
    expect(
      profiles.entryCreateSchema.safeParse({ section: 'education', employer: 'x', title: 'y' })
        .success,
    ).toBe(false);
    expect(
      profiles.entryCreateSchema.safeParse({
        section: 'experience',
        employer: 'A',
        title: 'B',
        startMonth: '2024-05',
        isCurrent: true,
        endMonth: '2024-09',
      }).success,
    ).toBe(false);
  });

  it('take a USPS region only in the US and https links only', () => {
    const patch = (identity: object) => profiles.profilePatchSchema.safeParse({ identity });
    expect(patch({ countryCode: 'US', region: 'AK' }).success).toBe(true);
    expect(patch({ countryCode: 'US', region: 'PR' }).success).toBe(false);
    expect(patch({ countryCode: 'US', region: 'Ontario' }).success).toBe(false);
    expect(patch({ countryCode: 'CA', region: 'Ontario' }).success).toBe(true);
    const link = (url: string) =>
      profiles.profilePatchSchema.safeParse({ portfolioLinks: [{ label: 'Site', url }] }).success;
    expect(link('https://maya.example')).toBe(true);
    expect(link('http://maya.example')).toBe(false);
    expect(link('javascript:alert(1)')).toBe(false);
  });

  it('never carry an uploaded file as the resume (FD-2)', () => {
    const snapshot = mayaApplicationSnapshot();
    expect(applications.applicationSnapshotV1Schema.safeParse(snapshot).success).toBe(true);
    const upload = { ...snapshot, resume: { mode: 'upload', template: null } };
    expect(applications.applicationSnapshotV1Schema.safeParse(upload).success).toBe(false);
    const attached = {
      ...snapshot,
      resume: { ...snapshot.resume, uploadedMediaId: '019a4a3c-0000-7000-8000-0000000d0009' },
    };
    expect(applications.applicationSnapshotV1Schema.safeParse(attached).success).toBe(false);
    const patch = (resume: object) => profiles.profilePatchSchema.safeParse({ resume }).success;
    expect(patch({ mode: 'compact' })).toBe(true);
    expect(patch({ mode: 'upload' })).toBe(false);
    expect(
      patch({ mode: 'classic', uploadedMediaId: '019a4a3c-0000-7000-8000-0000000d0009' }),
    ).toBe(false);
    expect(
      'useAsResume' in
        profiles.mergeImportSchema.parse({
          id: '019a4a3c-0000-7000-8000-0000000d0009',
          decisions: { identity: {}, items: {} },
          useAsResume: true,
        }),
    ).toBe(false);
  });

  it('cap highlighted skills at 15 and need a date for Beyond', () => {
    const skills = (n: number) =>
      Array.from({ length: 20 }, (_, i) => ({ label: `Skill ${i}`, highlighted: i < n }));
    expect(profiles.skillsSchema.safeParse({ skills: skills(15) }).success).toBe(true);
    expect(profiles.skillsSchema.safeParse({ skills: skills(16) }).success).toBe(false);
    expect(
      profiles.availabilityInputSchema.safeParse({ preset: 'beyond', clientToday: '2026-11-10' })
        .success,
    ).toBe(false);
    expect(
      profiles.availabilityInputSchema.safeParse({ preset: 'now', clientToday: '2026-11-10' })
        .success,
    ).toBe(true);
  });
});

describe('client-safe libs', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const VALUE_IMPORT = /^import (?!type).*from '(@\/modules\/|@\/lib\/db|drizzle-orm)/;

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : [full];
    });
  }

  it.each(['profiles', 'applications', 'safety'])(
    'src/lib/%s never value-imports a module, the database or Drizzle',
    (lib) => {
      const offending = files(path.join(root, 'src/lib', lib)).flatMap((file) =>
        readFileSync(file, 'utf8')
          .split(/\r?\n/)
          .filter((line) => VALUE_IMPORT.test(line))
          .map((line) => `${path.relative(root, file)}: ${line}`),
      );
      expect(offending).toEqual([]);
    },
  );
});
