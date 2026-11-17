'use client';

// Flow B on /apply/[listingId]: details, questions, review, then the sent, error and offline
// frames. A render never submits. Only "Send application" does, and a 201 stays on the sent
// frame (page 02) with a link to the status page. The draft is sessionStorage.
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  HOSTS_CANT_APPLY,
  LISTING_CHANGED_PROMPT,
  SPONSORSHIP_PROMPT,
  UNAVAILABLE,
  youBlocked,
  type ApplyContextDto,
  type ReceiptDto,
} from '@/lib/applications';
import { PROFILE_US_REGIONS } from '@/lib/profiles/constants';
import {
  Button,
  Checkbox,
  Dialog,
  ErrorState,
  Input,
  Radio,
  RadioGroup,
  Select,
  Textarea,
} from '@/ui/components';
import { WifiOff } from '@/ui/icons';
import { clearDraft, emptyDraft, loadDraft, saveDraft, type AnswerValue, type Draft } from '../_lib/draft';
import {
  answerText,
  detailsReady,
  formatDay,
  missingAnswers,
  openingStep,
  profilePatchFor,
  readFailure,
  submitBody,
  type ApplyStep,
} from '../_lib/flow';
import { ApplicationChrome } from './ApplicationChrome';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-6 pb-28 md:pb-0';
const FOOTER =
  'fixed inset-x-0 z-20 border-t border-line bg-surface px-4 py-3 md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0';
const ABOVE_BOTTOM_TABS = {
  bottom: 'calc(1px + 3.875rem + max(1rem, env(safe-area-inset-bottom)))',
} as const;

export type ApplyInitial =
  | { name: 'error' }
  | { name: 'offline' }
  | { name: 'sent'; receipt: ReceiptDto };

type Phase =
  | { name: 'loading' }
  | { name: 'offline' }
  | { name: 'error' }
  | { name: 'host' }
  | { name: 'blocked'; message: string }
  | { name: 'closed'; context: ApplyContextDto }
  | { name: 'existing'; context: ApplyContextDto }
  | { name: 'form'; context: ApplyContextDto; step: ApplyStep; sending: boolean }
  | { name: 'sent'; receipt: ReceiptDto };

function phaseFrom(context: ApplyContextDto, step?: ApplyStep): Phase {
  if (context.blocked === 'you_blocked') {
    return { name: 'blocked', message: youBlocked(context.listing.orgName) };
  }
  if (context.blocked === 'unavailable') return { name: 'blocked', message: UNAVAILABLE };
  if (context.existingApplicationId) return { name: 'existing', context };
  if (context.listing.status === 'closed') return { name: 'closed', context };
  return { name: 'form', context, step: step ?? openingStep(context), sending: false };
}

export function ApplyFlow({
  listingId,
  source,
  invite,
  initial = null,
  fallback = { title: 'Apply', orgName: 'The host' },
}: {
  listingId: string;
  source: string;
  invite: string | null;
  initial?: ApplyInitial | null;
  fallback?: { title: string; orgName: string };
}) {
  const [phase, setPhase] = useState<Phase>(() => {
    if (initial?.name === 'error') return { name: 'error' };
    if (initial?.name === 'offline') return { name: 'offline' };
    if (initial?.name === 'sent') return initial;
    return { name: 'loading' };
  });
  const [draft, setDraft] = useState<Draft>(() => loadDraft(listingId) ?? emptyDraft());
  const [attempt, setAttempt] = useState(0);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [changedOpen, setChangedOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [answerError, setAnswerError] = useState(false);

  useEffect(() => {
    if (initial) return;
    saveDraft(listingId, draft);
  }, [draft, initial, listingId]);

  const load = useCallback(async (): Promise<ApplyContextDto | null> => {
    const response = await fetch(`/api/v1/apply/${encodeURIComponent(listingId)}/context`);
    if (!response.ok) {
      const failure = await readFailure(response);
      setPhase(failure.reason === 'wrong_account_type' ? { name: 'host' } : { name: 'error' });
      return null;
    }
    return (await response.json()) as ApplyContextDto;
  }, [listingId]);

  useEffect(() => {
    if (initial) return;
    let cancel = false;
    const run = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancel) setPhase({ name: 'offline' });
        return;
      }
      try {
        const context = await load();
        if (!cancel && context) setPhase(phaseFrom(context));
      } catch {
        if (!cancel) {
          setPhase(navigator.onLine === false ? { name: 'offline' } : { name: 'error' });
        }
      }
    };
    void run();
    return () => {
      cancel = true;
    };
  }, [attempt, initial, load]);

  function retry() {
    if (initial?.name === 'error') {
      setPhase({ name: 'error' });
      return;
    }
    if (initial?.name === 'offline') {
      setPhase({ name: 'offline' });
      return;
    }
    if (initial?.name === 'sent') return;
    setPhase({ name: 'loading' });
    setAttempt((n) => n + 1);
  }

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function setAnswer(id: string, value: AnswerValue) {
    setAnswerError(false);
    setDraft((current) => ({ ...current, answers: { ...current.answers, [id]: value } }));
  }

  async function saveDetails() {
    if (phase.name !== 'form') return;
    const patch = profilePatchFor(phase.context.missingFields, draft);
    if (!patch) return;
    setPhase({ ...phase, sending: true });
    try {
      const response = await fetch('/api/v1/me/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setPhase(navigator.onLine === false ? { name: 'offline' } : { name: 'error' });
        return;
      }
      const context = await load();
      if (!context) return;
      setPhase(phaseFrom(context));
    } catch {
      setPhase(navigator.onLine === false ? { name: 'offline' } : { name: 'error' });
    }
  }

  async function send(acknowledgeSponsorship: boolean) {
    if (phase.name !== 'form') return;
    if (missingAnswers(phase.context.questions, draft.answers).length > 0) {
      setAnswerError(true);
      setPhase({ ...phase, step: 'questions', sending: false });
      return;
    }
    const current = phase;
    setSponsorOpen(false);
    setPhase({ ...current, sending: true });
    try {
      const response = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          submitBody({
            listingId,
            listingRevisionId: current.context.listing.revisionId,
            source,
            invite,
            questions: current.context.questions,
            answers: draft.answers,
            acknowledgeSponsorship,
          }),
        ),
      });
      if (response.status === 201 || response.status === 200) {
        const body = (await response.json()) as { application: ReceiptDto };
        clearDraft(listingId);
        setPhase({ name: 'sent', receipt: body.application });
        return;
      }
      const failure = await readFailure(response);
      if (failure.reason === 'sponsorship_ack_required') {
        setPhase({ ...current, sending: false });
        setSponsorOpen(true);
        return;
      }
      if (failure.reason === 'listing_changed') {
        setChangedOpen(true);
        const context = await load();
        if (context) setPhase(phaseFrom(context, 'review'));
        return;
      }
      if (failure.reason === 'resume_unavailable') {
        setPhase({ ...current, sending: false });
        setResumeOpen(true);
        return;
      }
      if (failure.reason === 'you_blocked') {
        setPhase({ name: 'blocked', message: youBlocked(current.context.listing.orgName) });
        return;
      }
      if (failure.reason === 'unavailable') {
        setPhase({ name: 'blocked', message: UNAVAILABLE });
        return;
      }
      if (failure.reason === 'listing_closed') {
        setPhase({
          name: 'closed',
          context: {
            ...current.context,
            listing: { ...current.context.listing, status: 'closed' },
          },
        });
        return;
      }
      if (failure.reason === 'wrong_account_type') {
        setPhase({ name: 'host' });
        return;
      }
      setPhase(navigator.onLine === false ? { name: 'offline' } : { name: 'error' });
    } catch {
      setPhase(navigator.onLine === false ? { name: 'offline' } : { name: 'error' });
    }
  }

  async function chooseClassic() {
    if (phase.name !== 'form') return;
    setResumeOpen(false);
    const response = await fetch('/api/v1/me/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resume: { mode: 'classic' } }),
    });
    if (!response.ok) {
      setPhase({ name: 'error' });
      return;
    }
    await send(false);
  }

  const org =
    phase.name === 'form' || phase.name === 'closed' || phase.name === 'existing'
      ? phase.context.listing.orgName
      : phase.name === 'sent'
        ? phase.receipt.snapshot.listing.orgName
        : fallback.orgName;
  const title =
    phase.name === 'form' || phase.name === 'closed' || phase.name === 'existing'
      ? phase.context.listing.title
      : phase.name === 'sent'
        ? phase.receipt.snapshot.listing.title
        : fallback.title;

  return (
    <>
      {phase.name === 'loading' ? (
        <p role="status" className="text-16 text-muted">
          Loading this job.
        </p>
      ) : null}

      {phase.name === 'offline' ? (
        <Frame org={org} title={title} status="Not sent yet" saved>
          <ErrorState
            icon={WifiOff}
            title="You're offline"
            titleAs="h2"
            description="Your answers are saved on this phone. Try again when you're back online."
            action={
              <Button size="lg" onClick={retry}>
                Try again
              </Button>
            }
          />
        </Frame>
      ) : null}

      {phase.name === 'error' ? (
        <Frame org={org} title={title} status="Not sent yet">
          <ErrorState
            title="We couldn't send your application"
            titleAs="h2"
            description="Something went wrong on our side."
            action={
              <Button size="lg" onClick={retry}>
                Try again
              </Button>
            }
          />
        </Frame>
      ) : null}

      {phase.name === 'host' ? (
        <Frame org={org} title={title} status="Not sent yet">
          <h2 className="text-19 font-bold text-ink">{HOSTS_CANT_APPLY}</h2>
        </Frame>
      ) : null}

      {phase.name === 'blocked' ? (
        <Frame org={org} title={title} status="Not sent yet">
          <h2 className="text-19 font-bold text-ink">{phase.message}</h2>
        </Frame>
      ) : null}

      {phase.name === 'closed' ? (
        <Frame org={org} title={title} status="Closed">
          <h2 className="text-19 font-bold text-ink">This job is closed.</h2>
        </Frame>
      ) : null}

      {phase.name === 'existing' ? (
        <Frame org={org} title={title} status="Sent">
          <h2 className="text-19 font-bold text-ink">You&apos;ve already applied to this job.</h2>
          <Button asChild size="lg">
            <Link href={`/profile/applications/${phase.context.existingApplicationId}`}>
              View application
            </Link>
          </Button>
        </Frame>
      ) : null}

      {phase.name === 'sent' ? (
        <Frame org={org} title={title} status="Sent">
          <h2 className="text-19 font-bold text-ink">Application sent</h2>
          <SentFacts receipt={phase.receipt} />
          <p className="text-16 text-ink-2">{org} has your application.</p>
          <Button asChild size="lg">
            <Link href={`/profile/applications/${phase.receipt.applicationId}`}>View application</Link>
          </Button>
        </Frame>
      ) : null}

      {phase.name === 'form' && phase.step === 'details' ? (
        <Frame org={org} title={title} status="Not sent yet" saved>
          <h2 className="text-19 font-bold text-ink">Your details</h2>
          <DetailsFields context={phase.context} draft={draft} onChange={update} />
          <div className={FOOTER} style={ABOVE_BOTTOM_TABS}>
            <Button
              size="lg"
              fullWidth
              loading={phase.sending}
              disabled={!detailsReady(phase.context.missingFields, draft)}
              onClick={() => void saveDetails()}
            >
              Continue
            </Button>
          </div>
        </Frame>
      ) : null}

      {phase.name === 'form' && phase.step === 'questions' ? (
        <Frame org={org} title={title} status="Not sent yet">
          <h2 className="text-19 font-bold text-ink">Questions</h2>
          <p className="text-16 text-ink-2">You&apos;re signed in. Finish applying to {title}.</p>
          <p className="text-16 font-semibold text-ink">
            {phase.context.preview.firstName} {phase.context.preview.lastName}
            {phase.context.preview.city ? ` · ${phase.context.preview.city}` : ''}
            {phase.context.preview.region ? `, ${phase.context.preview.region}` : ''}
          </p>
          <QuestionFields
            questions={phase.context.questions}
            answers={draft.answers}
            invalid={answerError}
            onChange={setAnswer}
          />
          <div className={FOOTER} style={ABOVE_BOTTOM_TABS}>
            <Button size="lg" fullWidth onClick={() => {
              if (missingAnswers(phase.context.questions, draft.answers).length > 0) {
                setAnswerError(true);
                return;
              }
              setPhase({ ...phase, step: 'review' });
            }}>
              Review application
            </Button>
          </div>
        </Frame>
      ) : null}

      {phase.name === 'form' && phase.step === 'review' ? (
        <Frame org={org} title={title} status="Ready to send" saved>
          <h2 className="text-19 font-bold text-ink">Review your application</h2>
          <ReviewSummary context={phase.context} draft={draft} />
          <div className={FOOTER} style={ABOVE_BOTTOM_TABS}>
            <Button size="lg" fullWidth loading={phase.sending} onClick={() => void send(false)}>
              Send application
            </Button>
          </div>
        </Frame>
      ) : null}

      <Dialog
        open={sponsorOpen}
        onOpenChange={setSponsorOpen}
        title={SPONSORSHIP_PROMPT}
        footer={
          <>
            <Button asChild variant="secondary">
              <Link href={`/jobs/view/${encodeURIComponent(listingId)}`}>Go back</Link>
            </Button>
            <Button onClick={() => void send(true)}>Apply anyway</Button>
          </>
        }
      />
      <Dialog
        open={changedOpen}
        onOpenChange={setChangedOpen}
        title={LISTING_CHANGED_PROMPT}
        footer={<Button onClick={() => setChangedOpen(false)}>Review the job</Button>}
      />
      <Dialog
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        title="Your resume isn't available"
        description="Use the Classic resume instead, then send again."
        footer={<Button onClick={() => void chooseClassic()}>Use Classic instead</Button>}
      />
    </>
  );
}

function Frame({
  org,
  title,
  status,
  saved = false,
  children,
}: {
  org: string;
  title: string;
  status: string;
  saved?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={COLUMN}>
      <header className="flex flex-col gap-1">
        <p className="text-14 font-semibold text-muted">{org}</p>
        <h1 className="text-24 font-extrabold text-ink">{title}</h1>
      </header>
      <ApplicationChrome orgName={org} status={status} saved={saved} />
      {children}
    </article>
  );
}

function DetailsFields({
  context,
  draft,
  onChange,
}: {
  context: ApplyContextDto;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const missing = new Set(context.missingFields);
  return (
    <div className="flex flex-col gap-4">
      {missing.has('first_name') ? (
        <Input
          label="First name"
          required
          autoComplete="given-name"
          value={draft.firstName}
          onChange={(event) => onChange({ firstName: event.target.value })}
        />
      ) : (
        <p className="text-16 text-ink">
          {context.preview.firstName} {context.preview.lastName}
        </p>
      )}
      {missing.has('last_name') ? (
        <Input
          label="Last name"
          required
          autoComplete="family-name"
          value={draft.lastName}
          onChange={(event) => onChange({ lastName: event.target.value })}
        />
      ) : null}
      {missing.has('city') ? (
        <Input
          label="City"
          required
          autoComplete="address-level2"
          value={draft.city}
          onChange={(event) => onChange({ city: event.target.value })}
        />
      ) : null}
      {missing.has('region') ? (
        <Select
          label="State"
          required
          placeholder="State"
          value={draft.region === '' ? undefined : draft.region}
          onValueChange={(region) => onChange({ region })}
          options={PROFILE_US_REGIONS.map((code) => ({ value: code, label: code }))}
        />
      ) : null}
      {missing.has('work_authorization') ? (
        <RadioGroup legend="Work authorization">
          <Radio
            name="work-authorization"
            label="I'm authorized to work in the US"
            checked={draft.workAuthorization === 'authorized'}
            onChange={() => onChange({ workAuthorization: 'authorized' })}
          />
          <Radio
            name="work-authorization"
            label="I'll need visa sponsorship"
            checked={draft.workAuthorization === 'needs_sponsorship'}
            onChange={() => onChange({ workAuthorization: 'needs_sponsorship' })}
          />
        </RadioGroup>
      ) : null}
    </div>
  );
}

function QuestionFields({
  questions,
  answers,
  invalid,
  onChange,
}: {
  questions: ApplyContextDto['questions'];
  answers: Draft['answers'];
  invalid: boolean;
  onChange: (id: string, value: AnswerValue) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {questions.map((question) => {
        const value = answers[question.id];
        const showError = invalid && question.required && (value === undefined || value === '');
        if (question.type === 'yes_no') {
          return (
            <RadioGroup
              key={question.id}
              legend={question.prompt}
              error={showError ? 'Choose Yes or No.' : undefined}
            >
              <Radio
                name={question.id}
                label="Yes"
                checked={value === true}
                onChange={() => onChange(question.id, true)}
              />
              <Radio
                name={question.id}
                label="No"
                checked={value === false}
                onChange={() => onChange(question.id, false)}
              />
            </RadioGroup>
          );
        }
        if (question.type === 'multiple_choice') {
          if (question.allowMultiple) {
            const selected = Array.isArray(value) ? value : [];
            return (
              <div key={question.id} className="flex flex-col">
                <p className="mb-1 text-14 font-semibold text-ink">{question.prompt}</p>
                {question.choices.map((choice) => (
                  <Checkbox
                    key={choice}
                    label={choice}
                    checked={selected.includes(choice)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selected, choice]
                        : selected.filter((item) => item !== choice);
                      onChange(question.id, next);
                    }}
                  />
                ))}
              </div>
            );
          }
          return (
            <RadioGroup key={question.id} legend={question.prompt}>
              {question.choices.map((choice) => (
                <Radio
                  key={choice}
                  name={question.id}
                  label={choice}
                  checked={value === choice}
                  onChange={() => onChange(question.id, choice)}
                />
              ))}
            </RadioGroup>
          );
        }
        return (
          <Textarea
            key={question.id}
            label={question.prompt}
            required={question.required}
            value={typeof value === 'string' ? value : ''}
            error={showError ? 'Answer this question.' : undefined}
            onChange={(event) => onChange(question.id, event.target.value)}
          />
        );
      })}
    </div>
  );
}

function SentFacts({ receipt }: { receipt: ReceiptDto }) {
  const listing = receipt.snapshot.listing;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-15">
      <dt className="text-muted">Status</dt>
      <dd className="font-semibold text-ink">Sent</dd>
      <dt className="text-muted">Sent</dt>
      <dd className="font-semibold text-ink">{formatDay(receipt.submittedAt)}</dd>
      <dt className="text-muted">Where</dt>
      <dd className="font-semibold text-ink">{listing.locationLabel}</dd>
      <dt className="text-muted">Dates</dt>
      <dd className="font-semibold text-ink">
        {formatDay(listing.startDate)} to {formatDay(listing.endDate)}
      </dd>
    </dl>
  );
}

function ReviewSummary({ context, draft }: { context: ApplyContextDto; draft: Draft }) {
  const name = [draft.firstName || context.preview.firstName, draft.lastName || context.preview.lastName]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-3 text-16 text-ink">
      <p>
        {name} · {draft.city || context.preview.city}
        {context.preview.region ? `, ${context.preview.region}` : ''}
      </p>
      <p>
        {context.listing.locationLabel} · {formatDay(context.listing.startDate)} to{' '}
        {formatDay(context.listing.endDate)}
      </p>
      {context.questions.map((question) => (
        <p key={question.id}>
          <span className="font-semibold">{question.prompt}</span> {answerText(draft.answers[question.id])}
        </p>
      ))}
    </div>
  );
}
