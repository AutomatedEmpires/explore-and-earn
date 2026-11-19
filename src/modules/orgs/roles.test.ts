import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { HOST_CAPABILITIES, can, requireCapability, type HostCapability } from './roles';

type Role = 'owner' | 'admin' | 'recruiter' | 'billing';

// The SP2 spec section 10 matrix: which roles hold each capability.
const MATRIX: Record<HostCapability, Role[]> = {
  'listings.manage': ['owner', 'admin', 'recruiter'],
  'applicants.access': ['owner', 'admin', 'recruiter'],
  'messages.access': ['owner', 'admin', 'recruiter'],
  'invites.send': ['owner', 'admin', 'recruiter'],
  'listings.approve': ['owner', 'admin'],
  'hostpage.edit': ['owner', 'admin'],
  'locations.manage': ['owner', 'admin'],
  'team.manage': ['owner', 'admin'],
  'activity.read': ['owner', 'admin'],
  'billing.plan': ['owner', 'admin'],
  'org.transfer': ['owner'],
  'org.delete': ['owner'],
  'billing.portal': ['owner', 'admin', 'billing'],
};

const ROLES: Role[] = ['owner', 'admin', 'recruiter', 'billing'];

describe('can', () => {
  it('covers all 13 capabilities', () => {
    expect([...HOST_CAPABILITIES].sort()).toEqual(Object.keys(MATRIX).sort());
    expect(HOST_CAPABILITIES).toHaveLength(13);
  });

  const cases = Object.entries(MATRIX).flatMap(([cap, allowed]) =>
    ROLES.map((role) => [cap as HostCapability, role, allowed.includes(role)] as const),
  );

  it.each(cases)('%s for %s is %s', (cap, role, expected) => {
    expect(can({ role }, cap)).toBe(expected);
  });
});

describe('requireCapability', () => {
  it('throws forbidden with reason role_not_allowed', () => {
    let err: unknown;
    try {
      requireCapability({ role: 'billing' }, 'listings.manage');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('forbidden');
    expect((err as AppError).message).toBe('Your role in this organization does not allow this');
    expect((err as AppError).details).toEqual({ reason: 'role_not_allowed' });
  });

  it('passes for an allowed role', () => {
    expect(() => requireCapability({ role: 'recruiter' }, 'listings.manage')).not.toThrow();
  });
});
