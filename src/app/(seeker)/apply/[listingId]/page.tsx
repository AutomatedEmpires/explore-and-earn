// /apply/[listingId]: where Apply leads (from a card, the deck, the detail page and a returning
// guest's sign-in). A placeholder until SP4 replaces this file with the apply review; hidden in
// prod. SP3 links here with `?source=` for attribution (spec 8.7 and 8.12).
//
// Foundation's Placeholder pattern and seeker shell are not on this branch yet; when they
// merge, this renders <Placeholder title="Apply" subProject={4} name="Seeker" />.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnv } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Apply · Explore&Earn',
  robots: { index: false, follow: false },
};

export default function ApplyPage() {
  if (getEnv().APP_ENV === 'prod') notFound();
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-28 font-extrabold tracking-tight text-ink">Apply</h1>
      <p className="text-16 text-ink-2">Coming in sub-project 4: Seeker</p>
    </main>
  );
}
