// The deliberate actions that make the "Add to Home Screen" prompt eligible (SP3 spec 8.15).
// Actions announce themselves with a window event, so they need no reference to the provider.

export const INSTALL_TRIGGER_EVENT = 'ee:install-trigger';

export type InstallTrigger = 'save' | 'alert' | 'views' | 'manual';

/** Announces a trigger to the install prompt provider. A no-op outside the browser. */
export function emitInstallTrigger(trigger: Exclude<InstallTrigger, 'manual'>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INSTALL_TRIGGER_EVENT, { detail: { trigger } }));
}
