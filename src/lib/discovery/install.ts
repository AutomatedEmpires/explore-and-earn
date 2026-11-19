// The "Add to Home Screen" rules (SP3 spec 8.15). W0 stub: W6 replaces the bodies (Task 36).
import type { InstallTrigger } from './install-events';
import type { InstallState } from './types';

export type InstallSurface = 'seek' | 'map' | 'listing' | 'landing' | 'alerts' | 'other';

export function installDecision(_i: {
  state: InstallState | null;
  platform: 'chromium' | 'ios' | 'other';
  canPrompt: boolean;
  standalone: boolean;
  coarsePointer: boolean;
  inAppBrowser: boolean;
  surface: InstallSurface;
  trigger: InstallTrigger | null;
  shownThisVisit: boolean;
  overlayOpen: boolean;
  now: Date;
}): { show: false } | { show: true; variant: 'chromium' | 'ios'; line: 0 | 1 } {
  throw new Error('not implemented: installDecision');
}

export function nextInstallState(
  _s: InstallState | null,
  _outcome: 'dismissed' | 'installed',
  _manual: boolean,
  _now: Date,
): InstallState {
  throw new Error('not implemented: nextInstallState');
}

export function surfaceForPath(_pathname: string): InstallSurface {
  throw new Error('not implemented: surfaceForPath');
}

export function detectPlatform(_i: {
  userAgent: string;
  maxTouchPoints: number;
  supportsBeforeInstallPrompt: boolean;
}): 'chromium' | 'ios' | 'other' {
  throw new Error('not implemented: detectPlatform');
}

export function isInAppBrowser(_ua: string): boolean {
  throw new Error('not implemented: isInAppBrowser');
}

/** The `ee_install` state, or null (also when storage throws). */
export function readInstallState(): InstallState | null {
  throw new Error('not implemented: readInstallState');
}

export function writeInstallState(_s: InstallState): void {
  throw new Error('not implemented: writeInstallState');
}
