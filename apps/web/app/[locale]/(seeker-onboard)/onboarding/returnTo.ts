"use client";

import { useSearchParams } from "next/navigation";

import {
  RETURN_PARAM,
  safeInternalRedirect,
} from "../../../../lib/authRedirect";

/**
 * The return path a seeker should land on once onboarding finishes.
 *
 * WHY THE WIZARD CARRIES IT. D18 sends someone who reached Community without a
 * seeker profile through onboarding, and "back where you were going" is the
 * whole point of the detour. The wizard's steps navigate with router.push, so a
 * query parameter set on step one is dropped by step two unless each step
 * carries it forward deliberately — which is what stepHref below is for.
 *
 * VALIDATED ON EVERY READ, not once at the entrance. The value travels in a URL
 * the visitor can edit between any two steps, so the last step must not trust
 * what the first one was handed: every read runs the same same-origin check the
 * middleware and the sign-in page use, and an unsafe value simply becomes "no
 * return path" (the wizard's own default destination).
 */
export function useOnboardingReturnTo(): string | undefined {
  const params = useSearchParams();
  return safeInternalRedirect(params.get(RETURN_PARAM) ?? undefined);
}

/** A wizard step URL that preserves the (already validated) return path. */
export function stepHref(path: string, returnTo: string | undefined): string {
  if (!returnTo) return path;
  return `${path}?${RETURN_PARAM}=${encodeURIComponent(returnTo)}`;
}
