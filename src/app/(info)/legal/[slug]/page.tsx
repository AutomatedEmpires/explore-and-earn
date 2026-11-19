// /legal/<slug> (SP8 spec 8.5): the published version of a legal document. Until counsel has
// approved a version and the Owner has published it, the page says the document is still being
// finalized and gives the support address; a draft or a version with counsel is never shown. The
// age screen's refusal links here ("Read the Terms"), so the page must exist before launch.
// A non-key screen (designops rule 7): the quiet AuthFrame and the onboarding card and heading
// styles, nothing new. SP8 W9 replaces the body with the Markdown article layout, the version
// history and cookie settings after the founder approves that design.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getPublishedLegal, isLegalSlug, LEGAL_TITLES, type LegalSlug } from '@/modules/content';
import { getSetting } from '@/modules/settings';
import { Button } from '@/ui/components';
import { AuthFrame } from '@/ui/patterns/AuthFrame';

type Params = Promise<{ slug: string }>;

const card = 'w-full rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8';
const heading = 'text-24 font-extrabold tracking-tight text-ink';
const effectiveDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return {};
  const published = await getPublishedLegal(getDb(), slug);
  return {
    title: `${LEGAL_TITLES[slug]} · Explore&Earn`,
    // The holding page is not the document; keep it out of search results.
    ...(published ? {} : { robots: { index: false, follow: true } }),
  };
}

async function supportEmail(): Promise<string> {
  try {
    return (await getSetting(getDb(), 'business.support_email')).trim();
  } catch {
    return '';
  }
}

function NotYetPublished({ slug, email }: { slug: LegalSlug; email: string }) {
  const title = LEGAL_TITLES[slug];
  return (
    <section aria-labelledby="legal-title" className={`${card} flex flex-col gap-4`}>
      <h1 id="legal-title" className={heading}>
        {title}
      </h1>
      <p className="text-16 text-ink">
        We&rsquo;re still finalizing our {title}. It will be published here before you&rsquo;re
        asked to agree to it.
      </p>
      {email ? (
        <p className="text-16 text-ink">
          If you have a question about it now, email us at{' '}
          <a href={`mailto:${email}`} className="font-semibold underline underline-offset-4">
            {email}
          </a>
          .
        </p>
      ) : null}
      <Button asChild variant="secondary" size="lg" fullWidth>
        <Link href="/">Back to jobs</Link>
      </Button>
    </section>
  );
}

export default async function LegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();

  const doc = await getPublishedLegal(getDb(), slug);
  if (!doc) {
    return (
      <AuthFrame>
        <NotYetPublished slug={slug} email={await supportEmail()} />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <article aria-labelledby="legal-title" className={`${card} flex flex-col gap-4`}>
        <header className="flex flex-col gap-1">
          <h1 id="legal-title" className={heading}>
            {doc.title}
          </h1>
          <p className="text-13 text-muted">
            Version {doc.version} · Effective {effectiveDate.format(doc.effectiveAt)}
          </p>
        </header>
        {/* Plain text until W9's Markdown article layout: never parsed as HTML. */}
        <div className="text-15 wrap-anywhere whitespace-pre-wrap text-ink">{doc.bodyMd}</div>
      </article>
    </AuthFrame>
  );
}
