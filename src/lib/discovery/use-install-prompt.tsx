// The install prompt provider and hook (SP3 spec 3.3 and 8.15). W0 stub: W6 replaces it
// (Task 36).
import type { ReactNode } from 'react';

export function InstallPromptProvider(_p: { children: ReactNode }): ReactNode {
  throw new Error('not implemented: InstallPromptProvider');
}

export function useInstallPrompt(): {
  eligible: boolean;
  open(): void;
  trigger(
    t: 'save' | 'alert' | 'views',
    opts?: { immediate?: boolean; iosSavedSearch?: boolean },
  ): void;
} {
  throw new Error('not implemented: useInstallPrompt');
}
