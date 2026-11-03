// Server-side guards for pages, server actions and API routes. Each throws AppError
// (`unauthorized` or `forbidden`). Stubs: Task 8 replaces them.
import type { CurrentUser, OrgRole } from '@/modules/identity';

export type { CurrentUser, OrgRole };

export type HostContext = { user: CurrentUser; orgId: string; role: OrgRole };

export type OperatorContext = {
  user: CurrentUser;
  role: 'owner' | 'operator';
  queues: string[];
};

export async function requireUser(): Promise<CurrentUser> {
  throw new Error('not implemented');
}

export async function requireSeeker(): Promise<CurrentUser> {
  throw new Error('not implemented');
}

export async function requireHost(_opts?: { roles?: OrgRole[] }): Promise<HostContext> {
  throw new Error('not implemented');
}

export async function requireOperator(_opts?: {
  queue?: string;
  sensitive?: boolean;
}): Promise<OperatorContext> {
  throw new Error('not implemented');
}
