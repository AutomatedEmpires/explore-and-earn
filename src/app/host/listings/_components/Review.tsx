'use client';

// Step 10, Review (Figma 43:12143; legal fields 98:14695, 98:14976; endings 171:23323): hours
// and deductions, the automatic checks, warnings to read, the two publish checks, what applying
// looks like and the slot it uses, then Publish. Publishing sends the listing to review; it is
// never live from here.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Checkbox, ErrorState, Notice, Skeleton } from '@/ui/components';
import { CircleAlert, CircleCheck } from '@/ui/icons';
import { ApiError, api, type ChecksJson, type IssueJson, type PublishJson } from '../_lib/api';
import { money } from '../_lib/format';
import {
  MEAL_SLOTS,
  HOUSING_SLOTS,
  fieldKeyFor,
  sectionOfPath,
  stepTitle,
  type StepKey,
} from '../_lib/model';
import { arr, getPath, num, obj, str, strings, type Json } from '../_lib/paths';
import type { Form } from './fields';

export const ATTESTATIONS = [
  'The pay shown is the range we expect, in good faith, to pay for this job.',
  'These hours and deductions are what we expect for this job.',
] as const;

const PERIOD: Record<string, string> = {
  day: 'a night',
  week: 'a week',
  month: 'a month',
  season: 'a season',
};

function costLine(name: string, section: Json): string {
  if (section.provided !== true) return `${name}: not provided`;
  const cost = obj(section.cost);
  if (cost.free === true) return `${name}: free`;
  const cents = num(cost.cents);
  if (!cents) return `${name}: cost not added yet`;
  const how = cost.paidBy === 'direct' ? 'paid separately' : 'taken from pay';
  return `${name}: ${money(cents)} ${PERIOD[str(cost.period) ?? ''] ?? ''}, ${how}`.replace(
    '  ',
    ' ',
  );
}

function CheckRow({ ok, children }: { ok: boolean; children: ReactNode }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <li className="flex items-start gap-2 text-16 text-ink">
      <Icon
        className={
          ok ? 'mt-0.5 size-5 shrink-0 text-success' : 'mt-0.5 size-5 shrink-0 text-danger'
        }
      />
      <span>
        <span className="sr-only">{ok ? 'Passed: ' : 'Needs a fix: '}</span>
        {children}
      </span>
    </li>
  );
}

type PublishFailure =
  | { kind: 'network' }
  | { kind: 'blocked'; message: string; action?: { href: string; label: string } };

const BILLING = { href: '/host/billing', label: 'See plans' };

function failureFor(err: ApiError): PublishFailure {
  if (err.offline || err.status >= 500) return { kind: 'network' };
  switch (err.reason) {
    case 'not_entitled':
    case 'listing_slot_limit':
      return { kind: 'blocked', message: err.message, action: BILLING };
    case 'past_due':
      return {
        kind: 'blocked',
        message: err.message,
        action: { href: '/host/billing', label: 'Update payment' },
      };
    default:
      return { kind: 'blocked', message: err.message };
  }
}

export function ReviewSection({
  form,
  title,
  attest,
  onAttest,
  onGoTo,
  onPublished,
  card,
  active,
  savedAt,
}: {
  form: Form;
  title: string;
  attest: [boolean, boolean];
  onAttest: (index: 0 | 1, on: boolean) => void;
  onGoTo: (step: StepKey, field?: string) => void;
  onPublished: (state: PublishJson) => void;
  /** The card, where this layout shows it inside Review. */
  card: (headingId: string) => ReactNode;
  /** Review is on screen: run the checks, and again after each save. */
  active: boolean;
  /** When the draft was last saved. */
  savedAt: number;
}) {
  const [checks, setChecks] = useState<ChecksJson | null>(null);
  const [checksFailed, setChecksFailed] = useState<'offline' | 'error' | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [failure, setFailure] = useState<PublishFailure | null>(null);
  const [attestError, setAttestError] = useState(false);
  const localErrors = Object.entries(form.allErrors);

  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  });

  const runChecks = useCallback(async () => {
    setChecksFailed(null);
    await formRef.current.flushAll();
    try {
      setChecks(await api.checks(formRef.current.listingId));
    } catch (err) {
      setChecksFailed(err instanceof ApiError && err.offline ? 'offline' : 'error');
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void runChecks(), 600);
    return () => clearTimeout(t);
  }, [active, savedAt, runChecks]);

  const errors = checks?.errors ?? [];
  const warnings = checks?.warnings ?? [];
  const has = (pred: (i: IssueJson) => boolean) => errors.some(pred);
  const housingOn = getPath(form.draft, 'housing.provided') === true;
  const mealsOn = getPath(form.draft, 'meals.provided') === true;
  const photoCount = (housingOn ? HOUSING_SLOTS.length : 0) + (mealsOn ? MEAL_SLOTS.length : 0);
  const questions = arr(getPath(form.draft, 'applying.questions')).map(obj);
  const requiredCount = questions.filter((q) => q.required === true).length;
  const notify = strings(getPath(form.draft, 'applying.notifyMemberIds'));
  const names = notify.map((id) => {
    const m = form.refs.team?.find((t) => t.userId === id);
    return m?.displayName ?? m?.email ?? (id === form.ctx.viewerUserId ? 'You' : 'A team member');
  });
  const hours = num(getPath(form.draft, 'when.weeklyHours'));
  const deductions = str(getPath(form.draft, 'pay.deductions'));
  const slot = checks?.slot;
  const slotsFull = slot ? slot.used >= slot.limit : false;

  const publish = async () => {
    if (!attest[0] || !attest[1]) {
      setAttestError(true);
      document.getElementById('attest-0')?.focus();
      return;
    }
    setPublishing(true);
    setFailure(null);
    try {
      const saved = await form.flushAll();
      if (!saved) {
        setFailure({ kind: 'network' });
        return;
      }
      const acknowledged = [
        ...new Set(
          warnings.map((w) =>
            w.code === 'photo_slot_mismatch'
              ? `photo_slot_mismatch:${w.field.split('.').pop() ?? ''}`
              : w.code,
          ),
        ),
      ];
      onPublished(await api.publish(form.listingId, acknowledged));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.status === 400 && err.issues.length > 0) {
        await runChecks();
        setFailure({ kind: 'blocked', message: err.message });
      } else if (err.reason === 'already_in_review') {
        onPublished({ state: 'in_review', reviewStage: null });
      } else {
        setFailure(failureFor(err));
      }
    } finally {
      setPublishing(false);
    }
  };

  if (failure?.kind === 'network') {
    return (
      <div className="flex flex-col gap-6">
        <ErrorState
          title={`Couldn’t publish ${title}`}
          description="Your draft is saved. Check your connection, then try again."
          action={
            <Button variant="secondary" loading={publishing} onClick={() => void publish()}>
              Try again
            </Button>
          }
        />
        <Button variant="secondary" size="lg" fullWidth onClick={() => setFailure(null)}>
          Back to the draft
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="md:hidden">{card('guest-card-review-phone')}</div>

      <div className="flex flex-col gap-1">
        <h3 className="text-16 font-bold text-ink">Hours and deductions</h3>
        <ul className="flex flex-col gap-1 text-16 text-ink-2">
          <li>{hours ? `${hours} hours a week` : 'Hours a week not added yet'}</li>
          <li>{costLine('Housing', obj(form.draft.housing))}</li>
          <li>{costLine('Meals', obj(form.draft.meals))}</li>
          <li>Other deductions: {deductions?.trim() ? deductions : 'none'}</li>
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-16 font-bold text-ink">Checks</h3>
        {checksFailed ? (
          <Notice
            tone="danger"
            title="We couldn’t run the checks"
            action={
              <Button variant="secondary" onClick={() => void runChecks()}>
                Try again
              </Button>
            }
          >
            {checksFailed === 'offline'
              ? 'You are offline. Your draft is saved on this device.'
              : 'Your draft is saved. Try again in a moment.'}
          </Notice>
        ) : !checks ? (
          <div role="status" aria-label="Running the checks" className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} shape="text" className="h-5 w-3/4" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <CheckRow ok={!has((i) => i.section === 'pay')}>
              Pay is a clear amount or range
            </CheckRow>
            <CheckRow
              ok={!has((i) => i.code === 'housing_cost_missing' || i.code === 'meals_cost_missing')}
            >
              Housing and meals each have a cost
            </CheckRow>
            <CheckRow
              ok={
                !has(
                  (i) => /^(housing|meals)\.photos/.test(i.field) || i.code === 'photo_unavailable',
                )
              }
            >
              {photoCount > 0
                ? `All ${photoCount} housing and meal photos are added`
                : 'Photos are added'}
            </CheckRow>
            <CheckRow ok={!has((i) => i.code === 'prohibited_wording' || i.code === 'link_unsafe')}>
              No wording problems found
            </CheckRow>
          </ul>
        )}
        {errors.length > 0 || localErrors.length > 0 ? (
          <Notice tone="danger" title="Fix these before you publish">
            <ul className="mt-1 flex flex-col gap-2">
              {/* One entry per field: this host's own check first (it names what to type), then
                  the server's. */}
              {[
                ...localErrors.map(([field, message]) => ({ field: fieldKeyFor(field), message })),
                ...errors.map((i) => ({ field: fieldKeyFor(i.field), message: i.message })),
              ]
                .filter((v, i, all) => all.findIndex((o) => o.field === v.field) === i)
                .map((i) => {
                  const step = sectionOfPath(i.field);
                  return (
                    <li key={i.field} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="font-semibold">{stepTitle(step, form.draft)}:</span>{' '}
                        {i.message}
                      </span>
                      <Button variant="secondary" onClick={() => onGoTo(step, i.field)}>
                        Fix it
                      </Button>
                    </li>
                  );
                })}
            </ul>
          </Notice>
        ) : null}
        {warnings.map((w) =>
          w.code === 'pay_below_min_wage' ? (
            <Notice
              key={w.field}
              tone="warning"
              title="Pay may be below the minimum wage"
              action={
                <Button variant="secondary" onClick={() => onGoTo('pay', 'pay.amount')}>
                  Change hours or costs
                </Button>
              }
            >
              {w.message} You can still publish. We will check this listing before it goes live.
            </Notice>
          ) : (
            <Notice
              key={w.field}
              tone="warning"
              title="Check this photo"
              action={
                <Button variant="secondary" onClick={() => onGoTo(sectionOfPath(w.field), w.field)}>
                  Change the photo
                </Button>
              }
            >
              {w.message} You can still publish.
            </Notice>
          ),
        )}
      </div>

      <fieldset className="flex flex-col">
        <legend className="mb-1 text-16 font-bold text-ink">Before you publish</legend>
        {ATTESTATIONS.map((text, i) => (
          <Checkbox
            key={text}
            id={`attest-${i}`}
            label={text}
            checked={attest[i as 0 | 1]}
            error={attestError && !attest[i as 0 | 1] ? 'Check this to publish.' : undefined}
            onChange={(e) => {
              onAttest(i as 0 | 1, e.currentTarget.checked);
              setAttestError(false);
            }}
          />
        ))}
      </fieldset>

      <div className="flex flex-col gap-1">
        <h3 className="text-16 font-bold text-ink">Applying</h3>
        <p className="text-16 text-ink">
          {questions.length === 0
            ? 'No screening questions.'
            : `${questions.length} screening ${questions.length === 1 ? 'question' : 'questions'}, ${requiredCount} required.`}{' '}
          {names.length > 0
            ? `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} ${names.length > 1 ? 'are' : 'is'} notified.`
            : 'No one is notified yet.'}
        </p>
      </div>

      {slot ? (
        slotsFull ? (
          <Notice
            tone="warning"
            title={`All ${slot.limit} listing slots are in use`}
            action={
              <Button asChild variant="secondary">
                <Link href="/host/billing">See plans</Link>
              </Button>
            }
          >
            Close a listing or choose a bigger plan to publish this one.
          </Notice>
        ) : (
          <p className="text-16 text-ink">
            This will use 1 of {slot.limit} listing slots. We check every new listing before guests
            see it, and you will get an email when the job is live.
          </p>
        )
      ) : null}

      <div className="hidden md:block xl:hidden">{card('guest-card-review-tablet')}</div>

      {failure?.kind === 'blocked' ? (
        <Notice
          tone="danger"
          announce="assertive"
          title={`Couldn’t publish ${title}`}
          action={
            failure.action ? (
              <Button asChild variant="secondary">
                <Link href={failure.action.href}>{failure.action.label}</Link>
              </Button>
            ) : undefined
          }
        >
          {failure.message}
        </Notice>
      ) : null}

      <Button
        size="lg"
        className="max-md:w-full md:self-start"
        loading={publishing}
        onClick={() => void publish()}
      >
        {warnings.length > 0 ? 'Publish for review' : 'Publish listing'}
      </Button>
    </>
  );
}
