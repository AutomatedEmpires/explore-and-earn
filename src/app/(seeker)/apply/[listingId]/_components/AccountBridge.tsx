// Account bridge (page 02): a guest who tapped Apply stays on this job. Continue opens sign-in,
// and sign-in sends them back with the apply step open (#82).
import Link from 'next/link';
import { Button } from '@/ui/components';
import { ApplicationChrome } from './ApplicationChrome';

export function AccountBridge({
  jobTitle,
  orgName,
  signInHref,
}: {
  jobTitle: string;
  orgName: string;
  signInHref: string;
}) {
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-14 font-semibold text-muted">{orgName}</p>
        <h1 className="text-24 font-extrabold text-ink">{jobTitle}</h1>
      </header>
      <ApplicationChrome orgName={orgName} status="Not sent yet" />
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-19 font-bold text-ink">Sign in to apply</h2>
        <p className="text-16 text-ink-2">
          Your place on this job is saved. After you sign in, you come back to the apply step.
        </p>
        <Button asChild size="lg">
          <Link href={signInHref}>Continue</Link>
        </Button>
      </section>
    </article>
  );
}
