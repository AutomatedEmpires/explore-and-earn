'use client';

// Start a listing (Figma 43:10808, 43:11060): start blank, copy a past listing, or paste a job
// post for the AI import to fill in (it never fills pay, benefits, housing or meals: FD-3).
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Notice, Select, Textarea } from '@/ui/components';
import { ApiError, api, type ListingRowJson } from '../_lib/api';

/** PASTE_MIN_CHARS in src/modules/listings/import.ts. */
const PASTE_MIN = 50;

function Option({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-16 font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function message(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.offline) return 'You are offline. Try again when you are back.';
    if (err.code === 'rate_limited')
      return 'You have pasted a lot of posts this hour. Start blank, or try again later.';
    if (err.status < 500) return err.message;
  }
  return 'We couldn’t start the listing. Try again.';
}

export function StartScreen({ base, orgName }: { base: string; orgName: string }) {
  const router = useRouter();
  const [library, setLibrary] = useState<ListingRowJson[]>([]);
  const [copyId, setCopyId] = useState<string | undefined>();
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'blank' | 'copy' | 'paste' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listListings('library')
      .then((r) => {
        setLibrary(r.items);
        setCopyId(r.items[0]?.id);
      })
      .catch(() => setLibrary([]));
  }, []);

  const start = async (
    kind: 'blank' | 'copy' | 'paste',
    input: Parameters<typeof api.createListing>[0],
  ) => {
    setBusy(kind);
    setError(null);
    try {
      const { id, openSection } = await api.createListing(input);
      router.push(openSection === 'basics' ? `${base}/${id}` : `${base}/${id}?step=${openSection}`);
    } catch (err) {
      setError(message(err));
      setBusy(null);
    }
  };

  const copied = library.find((l) => l.id === copyId);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-16 text-ink-2 md:hidden">{orgName}</p>
      <h1 className="text-24 font-extrabold text-ink md:text-28">Start a listing</h1>
      <p className="text-16 text-ink-2">
        A draft saves while you work. You can leave and come back.
      </p>
      {error ? (
        <Notice tone="danger" announce="assertive" title="That didn’t work">
          {error}
        </Notice>
      ) : null}

      <Option title="Start blank">
        <p className="text-16 text-ink">Write this job from the beginning.</p>
        <Button
          size="lg"
          className="max-md:w-full md:self-start"
          loading={busy === 'blank'}
          disabled={busy !== null && busy !== 'blank'}
          onClick={() => void start('blank', { start: 'blank' })}
        >
          Start blank
        </Button>
      </Option>

      {copied ? (
        <Option title="Copy a listing">
          {library.length > 1 ? (
            <Select
              label="Listing to copy"
              options={library.map((l) => ({ value: l.id, label: l.title ?? 'Untitled' }))}
              value={copyId}
              onValueChange={setCopyId}
            />
          ) : null}
          <p className="text-16 text-ink">
            {copied.title ?? 'Your last listing'}. Everything is copied but the dates, which you
            choose again.
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="max-md:w-full md:self-start"
            loading={busy === 'copy'}
            disabled={busy !== null && busy !== 'copy'}
            onClick={() => void start('copy', { start: 'copy', listingId: copied.id })}
          >
            Copy this listing
          </Button>
        </Option>
      ) : null}

      <Option title="Paste a job post">
        <Textarea
          label="Paste a job post"
          hideLabel
          placeholder="Paste the job post here"
          hint="Optional. Paste the text of a job post you already have. Pay, housing and meals are left for you to fill in."
          rows={4}
          maxLength={20_000}
          value={paste}
          error={pasteError ?? undefined}
          onChange={(e) => {
            setPaste(e.currentTarget.value);
            setPasteError(null);
          }}
        />
        <Button
          variant="secondary"
          size="lg"
          className="max-md:w-full md:self-start"
          loading={busy === 'paste'}
          disabled={busy !== null && busy !== 'paste'}
          onClick={() => {
            if (paste.trim().length < PASTE_MIN) {
              setPasteError(`Paste at least ${PASTE_MIN} characters of the post.`);
              return;
            }
            void start('paste', { start: 'paste', text: paste });
          }}
        >
          Fill the fields
        </Button>
      </Option>
    </div>
  );
}
