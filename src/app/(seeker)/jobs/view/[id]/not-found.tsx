// An unknown or removed listing (Figma 178:16169, 178:16237). The response is a 404 with
// noindex; the way on is Seek.
import Link from 'next/link';
import { Button, EmptyState } from '@/ui/components';
import { Bookmark, Search } from '@/ui/icons';

export default function ListingNotFound() {
  return (
    <EmptyState
      icon={Bookmark}
      titleAs="h1"
      title="We can’t find that job"
      description="It may have been removed, or the link has a typo. Search for jobs like it instead."
      action={
        <Button asChild variant="secondary">
          <Link href="/">
            <Search className="size-5" />
            Search jobs
          </Link>
        </Button>
      }
    />
  );
}
