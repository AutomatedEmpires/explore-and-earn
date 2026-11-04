// Operators need a passkey to use the console (spec section 3). The guard sends an operator
// without one here; once it is registered, they continue to the console.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldCheck } from '@/ui/icons';
import { PasskeySetup } from '../_components/PasskeySetup';
import { consoleViewer } from '../_lib/session';

export const metadata: Metadata = { title: 'Add a passkey' };

export default async function PasskeyPage() {
  const viewer = await consoleViewer();
  if (viewer.state === 'ok') redirect('/');

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 md:p-8">
      <span className="flex size-12 items-center justify-center rounded-lg bg-surface-2 text-ink">
        <ShieldCheck className="size-6" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-24 font-extrabold text-ink">Add a passkey</h1>
        <p className="text-15 text-ink-2">
          The operator console handles people&apos;s accounts and content, so it needs a passkey: a
          sign-in that lives on your device and cannot be phished.
        </p>
      </div>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-15 text-ink-2">
        <li>Choose Add a passkey.</li>
        <li>Confirm with your fingerprint, face or device PIN when your browser asks.</li>
        <li>You go straight on to the console.</li>
      </ol>
      <PasskeySetup />
    </section>
  );
}
