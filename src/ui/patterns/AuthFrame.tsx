import type { ReactNode } from 'react';
import { Wordmark } from '@/ui/components';

export type AuthFrameProps = {
  /** Clerk's sign-in or sign-up form, or the onboarding steps. */
  children: ReactNode;
  /** Below the form, e.g. a short line on what happens next. */
  footer?: ReactNode;
};

/** The quiet frame around sign-in, sign-up and onboarding: the wordmark, then one column. */
export function AuthFrame({ children, footer }: AuthFrameProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-bg px-4 py-10 sm:py-16">
      <header className="mb-8 flex w-full max-w-md justify-center">
        <Wordmark />
      </header>
      <main id="main" className="flex w-full max-w-md flex-1 flex-col items-center">
        {children}
      </main>
      {footer ? (
        <footer className="mt-8 w-full max-w-md text-center text-13 text-muted">{footer}</footer>
      ) : null}
    </div>
  );
}
