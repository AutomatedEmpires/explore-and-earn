// Page-side access for the seeker and host shells. The guards (src/server/guards.ts) throw
// AppError; pages turn a refusal into a redirect: sign in, finish onboarding, set up strong
// sign-in, or go to the shell the account belongs to.
//
// Layouts and pages both ask, and in the App Router a page can render without its layout
// re-running (client navigation between siblings), so every page checks for itself. The
// lookups are cached per request with React's cache(), so a layout and its page share one.
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { findHostMembership } from '@/modules/orgs';
import {
  requireHost,
  requireSeeker,
  requireUser,
  type CurrentUser,
  type HostContext,
  type OrgRole,
} from '@/server/guards';

export type AccountType = CurrentUser['accountType'];

/** The sign-in page, returning to `returnTo` afterwards. */
export function signInUrl(returnTo: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
}

/** The operator console's origin: the admin host, on the app's scheme. */
export function adminOrigin(env: { APP_URL: string; ADMIN_HOST: string }): string {
  return `${new URL(env.APP_URL).protocol}//${env.ADMIN_HOST}`;
}

/** Where a signed-in account belongs: its shell, or onboarding when it has no type yet. */
export function homeFor(accountType: AccountType, consoleOrigin: string): string {
  switch (accountType) {
    case 'seeker':
      return '/';
    case 'host':
      return '/host';
    case 'operator':
      return `${consoleOrigin}/`;
    default:
      return '/onboarding';
  }
}

/** What a page does when a guard refuses. */
export type Refusal =
  | { kind: 'sign_in' }
  | { kind: 'redirect'; to: string }
  | { kind: 'wrong_shell' }
  | { kind: 'locked' };

function detailsOf(err: AppError): Record<string, unknown> {
  return typeof err.details === 'object' && err.details !== null
    ? (err.details as Record<string, unknown>)
    : {};
}

/**
 * Maps a guard's error to what the page should do, or null for errors that are not a refusal
 * (those are rethrown). A host who is not a member of any organization finished choosing the
 * account type but not creating the organization, so they go back to onboarding to finish.
 */
export function refusalFor(err: unknown): Refusal | null {
  if (!(err instanceof AppError)) return null;
  if (err.code === 'unauthorized') return { kind: 'sign_in' };
  if (err.code !== 'forbidden') return null;
  const reason = detailsOf(err).reason;
  switch (reason) {
    case 'needs_onboarding':
    case 'not_a_member':
      return { kind: 'redirect', to: '/onboarding' };
    case 'needs_strong_auth':
      return { kind: 'locked' };
    case 'wrong_account_type':
      return { kind: 'wrong_shell' };
    default:
      return null;
  }
}

/** Placeholder screens exist only outside production (foundation spec section 11). */
export function notFoundInProd(): void {
  if (getEnv().APP_ENV === 'prod') notFound();
}

async function signedIn(): Promise<boolean> {
  const { userId } = await auth();
  return userId !== null;
}

/** The signed-in user's shell, for someone who opened another account type's shell. */
async function ownShell(): Promise<string> {
  const user = await requireUser();
  return homeFor(user.accountType, adminOrigin(getEnv()));
}

type Access<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'guest' }
  | { kind: 'locked' }
  | { kind: 'redirect'; to: string };

async function resolve<T>(guard: () => Promise<T>): Promise<Access<T>> {
  try {
    return { kind: 'ok', value: await guard() };
  } catch (err) {
    const refusal = refusalFor(err);
    if (!refusal) throw err;
    switch (refusal.kind) {
      case 'sign_in':
        return { kind: 'guest' };
      case 'locked':
        return { kind: 'locked' };
      case 'redirect':
        return { kind: 'redirect', to: refusal.to };
      case 'wrong_shell':
        return { kind: 'redirect', to: await ownShell() };
    }
  }
}

/** The seeker shell's viewer: a guest, a seeker, or someone who belongs elsewhere. */
export const seekerAccess = cache(async (): Promise<Access<CurrentUser>> => {
  if (!(await signedIn())) return { kind: 'guest' };
  return resolve(requireSeeker);
});

/**
 * For a seeker page. Guests may stay when `guests` is true (discovery and Community are open
 * to everyone); otherwise they are sent to sign in and back.
 */
export async function seekerPage(path: string, opts: { guests: true }): Promise<CurrentUser | null>;
export async function seekerPage(path: string, opts: { guests: false }): Promise<CurrentUser>;
export async function seekerPage(
  path: string,
  opts: { guests: boolean },
): Promise<CurrentUser | null> {
  const access = await seekerAccess();
  switch (access.kind) {
    case 'ok':
      return access.value;
    case 'redirect':
      return redirect(access.to);
    case 'locked':
    case 'guest':
      if (opts.guests) return null;
      return redirect(signInUrl(path));
  }
}

export type HostShellContext = HostContext & { clerkOrgId: string };

/** The host shell's viewer, with the Clerk ID of the organization being shown. */
export const hostAccess = cache(async (): Promise<Access<HostShellContext>> => {
  if (!(await signedIn())) return { kind: 'guest' };
  return resolve(async () => {
    const ctx = await requireHost();
    const { orgId: activeClerkOrgId } = await auth();
    const membership = await findHostMembership(getDb(), ctx.user.id, activeClerkOrgId ?? null);
    return { ...ctx, clerkOrgId: membership?.clerkOrgId ?? '' };
  });
});

/**
 * For a host workspace page: an Owner or Admin without a passkey or two-step sign-in is sent to
 * /host/security first.
 */
export async function hostPage(path: string): Promise<HostShellContext> {
  const access = await hostAccess();
  switch (access.kind) {
    case 'ok':
      return access.value;
    case 'locked':
      return redirect('/host/security');
    case 'redirect':
      return redirect(access.to);
    case 'guest':
      return redirect(signInUrl(path));
  }
}

/** For /host/security, which a host must reach before strong sign-in is set up. */
export async function hostSecurityPage(): Promise<{ locked: boolean }> {
  const access = await hostAccess();
  switch (access.kind) {
    case 'ok':
      return { locked: false };
    case 'locked':
      return { locked: true };
    case 'redirect':
      return redirect(access.to);
    case 'guest':
      return redirect(signInUrl('/host/security'));
  }
}

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  recruiter: 'Recruiter',
  billing: 'Billing',
};

export function roleLabel(role: OrgRole): string {
  return ROLE_LABELS[role];
}
