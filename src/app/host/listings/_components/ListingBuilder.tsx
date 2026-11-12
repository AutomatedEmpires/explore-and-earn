'use client';

// The listing builder (Figma 01 Host, section C). On a phone it is 10 steps, one section per
// screen, each starting with BuilderStepHeader; at 768 and 1440 it is one long form with a
// section rail and "What guests see" (beside the form at 1440, under it at 768). Every edit
// autosaves; inline errors keep what was typed; offline edits wait on the device.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/ui/cn';
import { Button, ErrorState, Notice, Skeleton } from '@/ui/components';
import { CircleCheck, Clock, Cloud } from '@/ui/icons';
import { ApiError, api, type EditorJson } from '../_lib/api';
import { savedLabel } from '../_lib/format';
import { clearLocal, mergeLocal, readLocal } from '../_lib/local';
import {
  SECTION_CONTENT,
  STEP_KEYS,
  normalizedDraft,
  sectionOfPath,
  stepTitle,
  validateAll,
  type StepKey,
} from '../_lib/model';
import { setPath, str, type Json } from '../_lib/paths';
import type { Destination, HostLocation, Occupation, TeamMember } from '../_lib/sample';
import { useDraft, type SaveStatus } from '../_lib/useDraft';
import { BuilderStepHeader } from './BuilderStepHeader';
import { CameraScreens } from './CameraScreens';
import { fieldId, type Form } from './fields';
import { GuestPreview } from './GuestPreview';
import { ReviewSection } from './Review';
import { BasicsSection, PaySection, WhereWhenSection } from './sections-a';
import { GenreDetailsSection, HousingSection, MealsSection } from './sections-b';
import { ApplyingSection, JobSection, PhotosSection } from './sections-c';
import { usePhotos } from './usePhotos';

export type BuilderProps = {
  listingId: string;
  /** Where the listings screens live: /host/listings, or the preview route. */
  base: string;
  viewerUserId: string;
  orgName: string;
  occupations: Occupation[];
  destinations: Destination[];
};

const INTRO: Partial<Record<StepKey, string>> = {
  basics: 'Use the words a guest should see.',
  pay: 'Guests see the full range. Nothing here is hidden.',
  genre_details: 'Fields for this kind of job. They show on the listing and in search.',
  job: 'Write a few notes and we can draft the description. You can edit every word.',
  photos: 'A cover is required. Add up to 8 more of the place and the work.',
  applying: 'Ask what you need to know before you reply. Guests answer these when they apply.',
  review: 'This is the last step before the job goes in for review.',
};

function useIsPhone(): boolean {
  const query = '(max-width: 767px)';
  const [phone, setPhone] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

function statusText(status: SaveStatus, pending: boolean, loadedAt: Date | null): string {
  switch (status.kind) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return pending ? 'Saving…' : savedLabel(status.at);
    case 'offline':
      return 'Not saved: offline';
    case 'error':
      return 'Not saved';
    case 'idle':
      return pending || !loadedAt ? 'Not saved yet' : savedLabel(loadedAt);
  }
}

function BuilderSkeleton() {
  return (
    <div role="status" aria-label="Loading the listing" className="flex flex-col gap-4">
      <Skeleton className="h-11 w-full" />
      <Skeleton shape="text" className="h-8 w-1/2" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton shape="text" className="w-1/3" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

type Loaded =
  | { kind: 'ready'; editor: EditorJson; fromDevice: boolean }
  | { kind: 'error'; offline: boolean; notFound: boolean };

async function loadEditor(listingId: string): Promise<Loaded> {
  try {
    const editor = await api.getEditor(listingId);
    return { kind: 'ready', editor, fromDevice: false };
  } catch (err) {
    const e = err instanceof ApiError ? err : null;
    const local = readLocal(listingId);
    if (e?.offline && local) {
      // Offline with this draft on the device: keep working on it.
      return {
        kind: 'ready',
        fromDevice: true,
        editor: {
          listing: {
            id: listingId,
            state: 'draft',
            title: str((local.draft.basics as Json | undefined)?.title) ?? null,
          },
          draft: local.draft,
          draftVersion: 0,
          sectionVersions: {},
          live: null,
          pending: null,
          checklist: [],
          aiFilledFields: [],
        } as unknown as EditorJson,
      };
    }
    return { kind: 'error', offline: !!e?.offline, notFound: e?.status === 404 };
  }
}

/** Loads the listing, then the workspace. */
export function ListingBuilder(props: BuilderProps) {
  const [state, setState] = useState<{ kind: 'loading' } | Loaded>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    void loadEditor(props.listingId).then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [props.listingId]);

  const load = () => {
    setState({ kind: 'loading' });
    void loadEditor(props.listingId).then(setState);
  };

  if (state.kind === 'loading') return <BuilderSkeleton />;
  if (state.kind === 'error') {
    if (state.offline) {
      return (
        <ErrorState
          icon={Cloud}
          title="You are offline"
          description="Your draft is saved. Try again when you are back online."
          action={<Button onClick={load}>Try again</Button>}
        />
      );
    }
    return (
      <ErrorState
        title={state.notFound ? 'We couldn’t find this listing' : 'We couldn’t load this listing'}
        description={
          state.notFound
            ? 'It may have been deleted.'
            : 'Your draft is saved. Try again in a moment.'
        }
        action={
          state.notFound ? (
            <Button asChild>
              <Link href={props.base}>Back to listings</Link>
            </Button>
          ) : (
            <Button onClick={load}>Try again</Button>
          )
        }
      />
    );
  }

  const { editor } = state;
  const listingState = editor.listing.state;
  if (listingState === 'in_review' || editor.pending) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="info" title={`${editor.listing.title ?? 'This listing'} is in review`}>
          We are checking it now, so it can’t be changed until the check ends.
        </Notice>
        <Button asChild variant="secondary" className="self-start">
          <Link href={`${props.base}/${props.listingId}/in-review`}>See where it stands</Link>
        </Button>
      </div>
    );
  }
  if (listingState === 'closed' || listingState === 'removed') {
    return (
      <ErrorState
        announce="none"
        title="This listing can’t be edited"
        description="It is closed. Repost it from your library to hire again."
        action={
          <Button asChild>
            <Link href={props.base}>Back to listings</Link>
          </Button>
        }
      />
    );
  }
  return <Workspace {...props} editor={editor} fromDevice={state.fromDevice} />;
}

function Workspace({
  listingId,
  base,
  viewerUserId,
  orgName,
  occupations,
  destinations,
  editor,
  fromDevice,
}: BuilderProps & { editor: EditorJson; fromDevice: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const phone = useIsPhone();
  const ctx = useMemo(() => ({ viewerUserId }), [viewerUserId]);
  const loadedAt = useMemo(
    () => (editor.listing.updatedAt ? new Date(editor.listing.updatedAt) : null),
    [editor],
  );

  const initial = useMemo(
    () =>
      fromDevice
        ? {
            draft: editor.draft,
            raw: readLocal(listingId)?.raw ?? {},
            dirty: readLocal(listingId)?.dirty ?? [],
          }
        : mergeLocal(editor.draft, readLocal(listingId), SECTION_CONTENT),
    [editor, fromDevice, listingId],
  );
  const d = useDraft({
    listingId,
    initialDraft: initial.draft,
    initialRaw: initial.raw,
    initialDirty: initial.dirty,
    versions: editor.sectionVersions,
    ctx,
  });

  const [locations, setLocations] = useState<HostLocation[] | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  useEffect(() => {
    api
      .locations()
      .then((l) => setLocations(l.filter((x) => !x.archived)))
      .catch(() => setLocations([]));
    api
      .team()
      .then((t) => setTeam(t.members))
      .catch(() => setTeam([]));
  }, []);

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attest, setAttest] = useState<[boolean, boolean]>([false, false]);
  const [exiting, setExiting] = useState(false);

  const requested = params.get('step');
  const step: StepKey = STEP_KEYS.includes(requested as StepKey)
    ? (requested as StepKey)
    : 'basics';
  const [visible, setVisible] = useState<StepKey>('basics');

  const shown = useMemo(() => normalizedDraft(d.draft, ctx), [d.draft, ctx]);
  const byStep = useMemo(() => validateAll(d.draft, d.raw), [d.draft, d.raw]);
  const allErrors = useMemo(
    () => Object.assign({}, ...Object.values(byStep)) as Record<string, string>,
    [byStep],
  );

  const photos = usePhotos({ phone, draft: shown, setValue: (path, value) => d.set(path, value) });

  const touch = useCallback((key: string) => {
    setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
  }, []);

  const [extraLocations, setExtraLocations] = useState<HostLocation[]>([]);
  const allLocations = useMemo(
    () => (locations === null ? null : [...locations, ...extraLocations]),
    [locations, extraLocations],
  );

  const form: Form = {
    listingId,
    draft: shown,
    raw: d.raw,
    ctx,
    phone,
    refs: { occupations, destinations, locations: allLocations, team, orgName },
    photos,
    set: d.set,
    setMany: (entries, text) =>
      d.update(
        (draft) => entries.reduce((acc, [path, value]) => setPath(acc, path, value), draft),
        [...new Set(entries.map(([path]) => sectionOfPath(path)))],
        text,
      ),
    setText: d.setText,
    touch,
    error: (key) => (touched.has(key) ? allErrors[key] : undefined),
    allErrors,
    addLocation: (loc) => setExtraLocations((l) => [...l, loc]),
    flushAll: d.flush,
  };

  const title = str((shown.basics as Json | undefined)?.title)?.trim() || 'This listing';
  const status = statusText(d.status, d.pending, loadedAt);
  const stepIndex = STEP_KEYS.indexOf(step);
  const done = (s: StepKey) =>
    !byStep[s] && (s !== 'review' || (attest[0] && attest[1] && Object.keys(byStep).length === 0));
  const doneCount = STEP_KEYS.filter(done).length;

  const focusField = (field?: string) => {
    if (!field) return;
    window.setTimeout(() => {
      const el =
        document.getElementById(fieldId(field)) ??
        document.getElementById(fieldId(field.split('.').slice(0, 2).join('.')));
      el?.focus();
      el?.scrollIntoView({ block: 'center' });
    }, 60);
  };

  const goTo = (s: StepKey, field?: string) => {
    if (phone) {
      void d.flush();
      router.push(`?step=${s}`, { scroll: true });
      if (!field) window.scrollTo(0, 0);
    } else {
      document.getElementById(`section-${s}`)?.scrollIntoView({ block: 'start' });
      setVisible(s);
    }
    if (field) {
      touch(field);
      focusField(field);
    }
  };

  const next = () => {
    const errors = byStep[step];
    if (errors) {
      const keys = Object.keys(errors);
      setTouched((t) => new Set([...t, ...keys]));
      focusField(keys[0]);
      return;
    }
    const following = STEP_KEYS[stepIndex + 1];
    if (following) goTo(following);
  };

  const exit = async () => {
    setExiting(true);
    await Promise.race([d.flush(), new Promise((r) => setTimeout(r, 4000))]);
    router.push(base);
  };

  // Desktop: the rail follows the section in view.
  const observed = useRef(false);
  useEffect(() => {
    if (phone || observed.current) return;
    observed.current = true;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const key = top?.target.id.replace('section-', '') as StepKey | undefined;
        if (key && STEP_KEYS.includes(key)) setVisible(key);
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    for (const s of STEP_KEYS) {
      const el = document.getElementById(`section-${s}`);
      if (el) io.observe(el);
    }
    return () => {
      io.disconnect();
      observed.current = false;
    };
  }, [phone]);

  const card = (id: string) => (
    <GuestPreview
      draft={shown}
      orgName={orgName}
      locations={allLocations}
      coverPreview={
        photos.slot('photos.coverMediaId').kind === 'filled'
          ? (photos.slot('photos.coverMediaId') as { preview: string | null }).preview
          : null
      }
      headingId={id}
    />
  );

  // The photo inputs stay in one place, so the camera's listener survives the camera screens.
  const cameraScreen =
    phone && photos.camera ? (
      <CameraScreens
        screen={photos.camera}
        orgName={orgName}
        onUse={photos.useThisPhoto}
        onRetake={photos.retake}
        onLibrary={photos.chooseFromLibrary}
        onClose={photos.closeCamera}
      />
    ) : null;

  const current = phone ? step : visible;
  const notices = (
    <>
      {d.status.kind === 'offline' ? (
        <Notice tone="warning" icon={Cloud} announce="polite" title="You are offline">
          This draft is saved on this device. We will save it when you are back online.
        </Notice>
      ) : null}
      {d.status.kind === 'error' ? (
        <Notice
          tone="danger"
          announce="assertive"
          title="We couldn’t save your last change"
          action={
            <Button variant="secondary" onClick={() => void d.flush()}>
              Try again
            </Button>
          }
        >
          {d.status.message} What you typed is still here.
        </Notice>
      ) : null}
      {d.conflict ? (
        <Notice
          tone="info"
          announce="polite"
          title={`Someone else changed ${stepTitle(d.conflict, shown)}`}
          action={
            <Button variant="secondary" onClick={d.dismissConflict}>
              OK
            </Button>
          }
        >
          We kept your version and saved it.
        </Notice>
      ) : null}
    </>
  );

  return (
    <>
      {photos.inputs}
      {cameraScreen ?? (
        <div className="flex flex-col gap-4 md:gap-6">
          <div className="md:hidden">
            <BuilderStepHeader
              step={stepIndex + 1}
              total={STEP_KEYS.length}
              status={status}
              onBack={() =>
                stepIndex === 0 ? router.push(base) : goTo(STEP_KEYS[stepIndex - 1] ?? 'basics')
              }
              onExit={() => void exit()}
              exiting={exiting}
            />
          </div>
          <header className="flex flex-col gap-3 max-md:sr-only">
            <div className="flex items-center justify-between gap-4">
              <p className="text-14 text-muted" aria-live="polite">
                {status} · {title} draft
              </p>
              <Button variant="secondary" loading={exiting} onClick={() => void exit()}>
                Save and exit
              </Button>
            </div>
            <h1 className="text-28 font-extrabold text-ink">
              {editor.listing.firstPublishedAt ? 'Edit listing' : 'New listing'}
            </h1>
            <p className="text-16 text-ink-2">
              Move between sections any time. The card updates as you type.
            </p>
          </header>
          {notices}

          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            <nav
              aria-label="Sections"
              className="max-md:hidden xl:sticky xl:top-6 xl:w-48 xl:shrink-0"
            >
              <p className="mb-2 text-14 text-muted">
                Sections
                <span className="xl:hidden">
                  {' '}
                  · {doneCount} of {STEP_KEYS.length} done
                </span>
              </p>
              <ul className="flex flex-col gap-1">
                {STEP_KEYS.map((s, i) => {
                  const ok = done(s);
                  const isCurrent = current === s;
                  return (
                    <li key={s} className={cn(!isCurrent && ok && 'xl:flex hidden')}>
                      <button
                        type="button"
                        aria-current={isCurrent ? 'step' : undefined}
                        onClick={() => goTo(s)}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-16 text-ink',
                          isCurrent ? 'bg-surface-2 font-semibold' : 'hover:bg-surface-2',
                        )}
                      >
                        {ok ? (
                          <CircleCheck className="size-5 shrink-0 text-ink-2" />
                        ) : (
                          <Clock className="size-5 shrink-0 text-ink-2" />
                        )}
                        <span>
                          {i + 1} · {s === 'review' ? 'Review' : stepTitle(s, shown)}
                          <span className="sr-only">{ok ? ', done' : ', not done'}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!(attest[0] && attest[1]) ? (
                <p className="mt-3 text-14 text-muted">
                  Review still needs the two checks before you publish.
                </p>
              ) : null}
            </nav>

            <div className="flex min-w-0 flex-1 flex-col gap-10">
              {STEP_KEYS.map((s, i) => {
                const headingId = `section-${s}-title`;
                const phoneTitle = s === 'review' ? 'Check the card' : stepTitle(s, shown);
                return (
                  <section
                    key={s}
                    id={`section-${s}`}
                    aria-labelledby={headingId}
                    className={cn(
                      'flex scroll-mt-6 flex-col gap-4',
                      s !== step && 'max-md:hidden',
                      i > 0 && 'md:border-t md:border-line md:pt-10',
                    )}
                  >
                    <h2 id={headingId} className="text-24 font-extrabold text-ink">
                      <span className="md:hidden">{phoneTitle}</span>
                      <span className="max-md:hidden">
                        {i + 1} · {s === 'review' ? 'Review' : stepTitle(s, shown)}
                      </span>
                    </h2>
                    {INTRO[s] ? <p className="text-16 text-ink-2">{INTRO[s]}</p> : null}
                    {s === 'basics' ? <BasicsSection form={form} /> : null}
                    {s === 'where_when' ? <WhereWhenSection form={form} /> : null}
                    {s === 'pay' ? <PaySection form={form} /> : null}
                    {s === 'housing' ? <HousingSection form={form} /> : null}
                    {s === 'meals' ? <MealsSection form={form} /> : null}
                    {s === 'genre_details' ? <GenreDetailsSection form={form} /> : null}
                    {s === 'job' ? <JobSection form={form} /> : null}
                    {s === 'photos' ? <PhotosSection form={form} /> : null}
                    {s === 'applying' ? <ApplyingSection form={form} /> : null}
                    {s === 'review' ? (
                      <ReviewSection
                        form={form}
                        title={title}
                        attest={attest}
                        onAttest={(index, on) =>
                          setAttest((a) => (index === 0 ? [on, a[1]] : [a[0], on]))
                        }
                        onGoTo={goTo}
                        onPublished={() => {
                          clearLocal(listingId);
                          router.push(`${base}/${listingId}/in-review`);
                        }}
                        card={card(`guest-card-review-${phone ? 'phone' : 'tablet'}`)}
                        active={phone ? step === 'review' : true}
                        savedAt={d.savedAt}
                      />
                    ) : null}
                    {s !== 'review' ? (
                      <Button size="lg" fullWidth className="md:hidden" onClick={next}>
                        Next
                      </Button>
                    ) : null}
                  </section>
                );
              })}
            </div>

            <aside className="hidden xl:sticky xl:top-6 xl:flex xl:w-80 xl:shrink-0">
              {card('guest-card-side')}
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
