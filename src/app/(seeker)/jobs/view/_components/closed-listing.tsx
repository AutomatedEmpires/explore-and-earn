// A closed listing (Figma 178:16021, 178:16103): its title, why it is closed, a way on to open
// jobs like it, and the host. There is no Apply. The closed date is not in the card data, so
// the notice says the host stopped taking applications without a date.
import Link from 'next/link';
import type { JobCardData } from '@/lib/discovery';
import { Button, CategoryBadge } from '@/ui/components';
import { Info } from '@/ui/icons';
import { FollowButton } from './follow-button';

export function ClosedListing({
  card,
  seeker,
  signInHref,
}: {
  card: JobCardData;
  seeker: boolean;
  signInHref: string;
}) {
  return (
    <article
      aria-labelledby="listing-title"
      className="mx-auto flex max-w-180 flex-col items-start gap-4 md:pt-2"
    >
      <CategoryBadge category={card.category} />
      <h1 id="listing-title" className="text-28 font-extrabold text-ink">
        {card.title}
      </h1>
      <div className="flex w-full gap-3 rounded-md bg-surface-2 py-3 pr-4 pl-3 text-16 text-ink">
        <Info className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col items-start gap-1">
          <p className="font-semibold">This job is closed</p>
          <p>{card.host.name} stopped taking applications. Here are open jobs like it.</p>
          <Button asChild variant="secondary" className="mt-1">
            <Link href={`/?cat=${card.category}`}>See similar jobs</Link>
          </Button>
        </div>
      </div>
      <p className="text-16 text-ink-2">
        <Link href={`/hosts/${card.host.slug}`} className="underline-offset-2 hover:underline">
          {card.host.name}
        </Link>{' '}
        · {card.locationLabel}
      </p>
      <FollowButton
        hostName={card.host.name}
        hostSlug={card.host.slug}
        seeker={seeker}
        signInHref={signInHref}
      />
    </article>
  );
}
