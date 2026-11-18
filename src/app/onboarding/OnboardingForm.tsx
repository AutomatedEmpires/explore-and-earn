'use client';

// Onboarding (foundation spec section 3): the account type is chosen once.
//   Step 1: "I'm looking for work" or "I'm hiring".
//   Seeker: gives their date of birth, then lands on Seek.
//   Host: names their organization, then lands on host Home.
// Both submit to POST /api/v1/onboarding, which returns where to go next: back to `returnTo`,
// the action a guest started before signing up (spec 5.1), or else the account's home.
//
// The seeker step is the age screen (legal review 2.6, P0 item 17), drawn in #128's approved
// frames "Legal fields · Account · date of birth" (default, error, refused and offline). It asks
// a neutral question, says only the year is kept, and never names an age or hints at the
// cut-off; the server decides. A refusal ends onboarding for the browser session: no way to try
// again, and both ways out sign the account out, so the person can look at jobs as a guest.
//
// The step lives in the URL (`?step=seeker|host`), so the browser's Back button returns to the
// choice and a refresh keeps the step. It changes through the native History API, which Next.js
// syncs into useSearchParams without a server round trip.
import { useClerk, useSession } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { safeReturnTo } from '@/lib/discovery/return-to';
import { cn } from '@/ui/cn';
import { Button, ErrorState, Input, Select } from '@/ui/components';
import { Briefcase, ChevronRight, CircleAlert, Compass, type IconComponent } from '@/ui/icons';
import { onboardingHref, stepFromParam, type OnboardingStep } from './return-to';

type OnboardingBody = (
  { accountType: 'seeker'; dateOfBirth: string } | { accountType: 'host'; organizationName: string }
) & { returnTo?: string };

const NAME_MIN = 2;
const NAME_MAX = 80;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const MONTH_OPTIONS = MONTHS.map((label, i) => ({ value: String(i + 1), label }));

/** The earliest year the server accepts (identity's MIN_BIRTH_YEAR). */
const MIN_YEAR = 1900;

type DateOfBirthInput = { month: string; day: string; year: string };
type DateOfBirthErrors = Partial<Record<keyof DateOfBirthInput, string>>;

/**
 * The typed date as `YYYY-MM-DD`, or what to fix, field by field. The server checks it again
 * and makes the age decision; this only catches typing mistakes.
 */
function checkDateOfBirth(
  input: DateOfBirthInput,
  today: Date,
): { dateOfBirth: string } | { errors: DateOfBirthErrors } {
  const errors: DateOfBirthErrors = {};
  const month = Number(input.month);
  const dayText = input.day.trim();
  const yearText = input.year.trim();
  const day = Number(dayText);
  const year = Number(yearText);

  if (!Number.isInteger(month) || month < 1 || month > 12) errors.month = 'Choose a month.';
  if (!/^\d{1,2}$/.test(dayText) || day < 1 || day > 31) errors.day = 'Enter the day, like 3.';
  if (!/^\d{4}$/.test(yearText)) errors.year = 'Enter all 4 numbers, like 1998.';
  else if (year < MIN_YEAR) errors.year = `Enter a year from ${MIN_YEAR} on.`;
  if (Object.keys(errors).length > 0) return { errors };

  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
    return { errors: { day: 'Enter a real date.' } };
  }
  const todayKey = today.getFullYear() * 10_000 + (today.getMonth() + 1) * 100 + today.getDate();
  if (year * 10_000 + month * 100 + day > todayKey) {
    return { errors: { year: 'Enter a date before today.' } };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return { dateOfBirth: `${yearText}-${pad(month)}-${pad(day)}` };
}

function errorMessage(status: number, body: unknown): string {
  if (status === 429) return 'Too many attempts. Wait a few minutes, then try again.';
  if (status === 400) return 'Check the form and try again.';
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = body.error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      if (typeof error.message === 'string' && status < 500) return error.message;
    }
  }
  return 'Something went wrong on our side. Try again in a moment.';
}

/** Whether the API refused the sign-up (403, `details.reason` `signup_refused`). */
function isRefusal(status: number, body: unknown): boolean {
  if (status !== 403 || typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }
  const error = body.error;
  if (typeof error !== 'object' || error === null || !('details' in error)) return false;
  const details = error.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    'reason' in details &&
    details.reason === 'signup_refused'
  );
}

function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-danger-bg p-3 text-14 font-semibold text-danger"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Choice({
  icon: Icon,
  title,
  description,
  onSelect,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  // The whole card is the button, so its name is all of its text (title, then description).
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-4 text-left hover:border-line-strong hover:bg-surface-2 motion-safe:transition-colors"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink group-hover:bg-surface">
        <Icon className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-17 font-bold text-ink">{title}</span>
        <span className="text-14 text-muted">{description}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </button>
  );
}

const card = 'w-full rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8';
const heading = 'text-24 font-extrabold tracking-tight text-ink outline-none';
const NEVER_PAY = 'You never pay to get a job.';

export type OnboardingFormProps = {
  /**
   * The account is already a host whose organization was not created (the request failed
   * halfway): naming it is the only step, with no way back to the choice.
   */
  hostOnly?: boolean;
  /** This browser session's sign-up was refused earlier: show only the refusal. */
  refused?: boolean;
  /** Where to finish: the checked same-site path the guest started from, or `/` for none. */
  returnTo?: string;
};

export function OnboardingForm({
  hostOnly = false,
  refused: refusedBefore = false,
  returnTo = '/',
}: OnboardingFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useSession();
  const { signOut } = useClerk();
  const step: OnboardingStep = hostOnly ? 'host' : stepFromParam(searchParams.get('step'));
  const [shownStep, setShownStep] = useState(step);
  const [dob, setDob] = useState<DateOfBirthInput>({ month: '', day: '', year: '' });
  const [dobErrors, setDobErrors] = useState<DateOfBirthErrors>({});
  const [orgName, setOrgName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState(refusedBefore);
  // The last seeker body that could not be sent because the device was offline.
  const [offlineBody, setOfflineBody] = useState<OnboardingBody | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  // Whether this page added a step to the history, so in-card Back can simply go back.
  const pushedStep = useRef(false);

  // A new step (in-card or with the browser's buttons) starts without the last step's errors.
  if (step !== shownStep) {
    setShownStep(step);
    setFieldError(null);
    setDobErrors({});
    setFormError(null);
    setOfflineBody(null);
  }

  // Each step is a new screen: move focus to its heading so it is announced.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, refused]);

  function go(next: Exclude<OnboardingStep, 'choose'>) {
    pushedStep.current = true;
    window.history.pushState(null, '', onboardingHref(returnTo, next));
  }

  function back() {
    if (pushedStep.current) {
      router.back();
      return;
    }
    // Opened at a step (a refresh or a link), so the choice is not behind it: show it in place.
    window.history.replaceState(null, '', onboardingHref(returnTo));
  }

  async function submit(body: OnboardingBody) {
    setPending(true);
    setFormError(null);
    try {
      const res = await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(returnTo === '/' ? body : { ...body, returnTo }),
      });
      const json: unknown = await res.json().catch(() => null);
      setOfflineBody(null);
      if (res.status === 409) {
        // Already onboarded (another tab, or a double submit): the page sends them on.
        router.refresh();
        return;
      }
      if (isRefusal(res.status, json)) {
        setRefused(true);
        setPending(false);
        return;
      }
      if (!res.ok) {
        setFormError(errorMessage(res.status, json));
        setPending(false);
        return;
      }
      // The API checks the path too; this keeps the browser on this site whatever it answers.
      const to = safeReturnTo(
        typeof json === 'object' &&
          json !== null &&
          'redirectTo' in json &&
          typeof json.redirectTo === 'string'
          ? json.redirectTo
          : null,
      );
      // The session token carries the account type the proxy reads; refresh it first.
      await session?.getToken({ skipCache: true }).catch(() => null);
      router.replace(to);
    } catch {
      setPending(false);
      if (body.accountType === 'seeker' && !navigator.onLine) {
        // The date stays in the form; Try again sends it once the device is back online.
        setOfflineBody(body);
        return;
      }
      setFormError('We could not reach Explore&Earn. Check your connection and try again.');
    }
  }

  function changeDob(field: keyof DateOfBirthInput, value: string) {
    setDob((current) => ({ ...current, [field]: value }));
    setDobErrors((current) => ({ ...current, [field]: undefined }));
  }

  function submitSeeker(e: FormEvent) {
    e.preventDefault();
    const checked = checkDateOfBirth(dob, new Date());
    if ('errors' in checked) {
      setDobErrors(checked.errors);
      return;
    }
    setDobErrors({});
    void submit({ accountType: 'seeker', dateOfBirth: checked.dateOfBirth });
  }

  function submitHost(e: FormEvent) {
    e.preventDefault();
    const name = orgName.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      setFieldError(`Enter a name between ${NAME_MIN} and ${NAME_MAX} characters.`);
      return;
    }
    setFieldError(null);
    void submit({ accountType: 'host', organizationName: name });
  }

  const backButton = hostOnly ? null : (
    <Button variant="ghost" onClick={back} disabled={pending} className="-ml-3 self-start px-3">
      Back
    </Button>
  );

  if (refused) {
    // Both ways out sign the account out: a signed-in account with no type is sent back here
    // from any page.
    return (
      <section aria-labelledby="onboarding-refused" className={`${card} flex flex-col gap-4`}>
        <h1 id="onboarding-refused" ref={headingRef} tabIndex={-1} className={heading}>
          We can’t make you an account
        </h1>
        <p className="text-16 text-ink">You can still look at jobs without an account.</p>
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth onClick={() => void signOut({ redirectUrl: '/' })}>
            Back to jobs
          </Button>
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => void signOut({ redirectUrl: '/legal/terms' })}
          >
            Read the Terms
          </Button>
        </div>
      </section>
    );
  }

  if (step === 'seeker' && offlineBody) {
    return (
      <section className={`${card} flex flex-col gap-4`}>
        <ErrorState
          titleAs="h1"
          title="You are offline"
          description="Your date of birth is saved on this phone. Try again when you are back."
          action={
            <Button loading={pending} onClick={() => void submit(offlineBody)}>
              Try again
            </Button>
          }
          className="py-6"
        />
        <p className="text-16 text-ink">{NEVER_PAY}</p>
      </section>
    );
  }

  if (step === 'seeker') {
    // Month takes its own row below sm: inside the card it would be 100 px at 390 and clip
    // "September". A field with an error widens so its message fits (frame 114:11923).
    return (
      <form onSubmit={submitSeeker} noValidate className={`${card} flex flex-col gap-4`}>
        {backButton}
        <h1 ref={headingRef} tabIndex={-1} className={heading}>
          What is your date of birth?
        </h1>
        <p className="text-16 text-ink">
          We ask everyone who makes an account. We keep only the year.
        </p>
        <fieldset className="min-w-0">
          <legend className="sr-only">Date of birth</legend>
          <div className="flex flex-wrap items-start gap-3">
            <Select
              name="birthMonth"
              label="Month"
              required
              placeholder="Choose"
              options={MONTH_OPTIONS}
              value={dob.month}
              onValueChange={(value) => changeDob('month', value)}
              error={dobErrors.month}
              disabled={pending}
              className="min-w-36 basis-full sm:basis-0 sm:flex-1"
            />
            <Input
              name="birthDay"
              label="Day"
              required
              inputMode="numeric"
              autoComplete="bday-day"
              maxLength={2}
              value={dob.day}
              onChange={(e) => changeDob('day', e.target.value)}
              error={dobErrors.day}
              disabled={pending}
              fieldClassName={cn('shrink-0', dobErrors.day ? 'w-34' : 'w-20')}
            />
            <Input
              name="birthYear"
              label="Year"
              required
              inputMode="numeric"
              autoComplete="bday-year"
              maxLength={4}
              value={dob.year}
              onChange={(e) => changeDob('year', e.target.value)}
              error={dobErrors.year}
              disabled={pending}
              fieldClassName={cn('shrink-0', dobErrors.year ? 'w-34' : 'w-26')}
            />
          </div>
        </fieldset>
        {formError ? <FormError>{formError}</FormError> : null}
        <Button type="submit" size="lg" fullWidth loading={pending}>
          Continue
        </Button>
        <p className="text-16 text-ink">{NEVER_PAY}</p>
      </form>
    );
  }

  if (step === 'host') {
    return (
      <form onSubmit={submitHost} noValidate className={`${card} flex flex-col gap-5`}>
        {backButton}
        <div className="flex flex-col gap-2">
          <h1 ref={headingRef} tabIndex={-1} className={heading}>
            Name your organization
          </h1>
          <p className="text-16 text-ink-2">
            Seekers see this name on your listings and your host page. You can invite your team once
            you are in.
          </p>
        </div>
        <Input
          name="organizationName"
          label="Organization name"
          required
          autoComplete="organization"
          maxLength={NAME_MAX}
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          error={fieldError}
          hint={fieldError ? undefined : 'For example, Kettle Ridge Lodge.'}
        />
        {formError ? <FormError>{formError}</FormError> : null}
        <Button type="submit" size="lg" fullWidth loading={pending}>
          Create organization
        </Button>
      </form>
    );
  }

  return (
    <section aria-labelledby="onboarding-title" className={`${card} flex flex-col gap-6`}>
      <div className="flex flex-col gap-2">
        <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className={heading}>
          Welcome to Explore&amp;Earn
        </h1>
        <p className="text-16 text-ink-2">
          How will you use Explore&amp;Earn? This sets up your account, and it can&apos;t be changed
          later.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Choice
          icon={Compass}
          title="I'm looking for work"
          description="Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever."
          onSelect={() => go('seeker')}
        />
        <Choice
          icon={Briefcase}
          title="I'm hiring"
          description="Post jobs and hire people who want to be there."
          onSelect={() => go('host')}
        />
      </div>
    </section>
  );
}
