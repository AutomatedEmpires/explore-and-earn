'use client';

// Onboarding (foundation spec section 3): the account type is chosen once.
//   Step 1: "I'm looking for work" or "I'm hiring".
//   Seeker: confirms they are 18 or older, then lands on Seek.
//   Host: names their organization, then lands on host Home.
// Both submit to POST /api/v1/onboarding, which returns where to go next.
import { useSession } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Checkbox, Input } from '@/ui/components';
import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  CircleAlert,
  Compass,
  type IconComponent,
} from '@/ui/icons';

export type OnboardingStep = 'choose' | 'seeker' | 'host';

type OnboardingBody =
  | { accountType: 'seeker'; adultAttested: true }
  | { accountType: 'host'; organizationName: string };

const NAME_MIN = 2;
const NAME_MAX = 80;

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

export function OnboardingForm({ initialStep = 'choose' }: { initialStep?: OnboardingStep }) {
  const router = useRouter();
  const { session } = useSession();
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [adult, setAdult] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Each step is a new screen: move focus to its heading so it is announced.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  function go(next: OnboardingStep) {
    setFieldError(null);
    setFormError(null);
    setStep(next);
  }

  async function submit(body: OnboardingBody) {
    setPending(true);
    setFormError(null);
    try {
      const res = await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json().catch(() => null);
      if (res.status === 409) {
        // Already onboarded (another tab, or a double submit): the page sends them on.
        router.refresh();
        return;
      }
      if (!res.ok) {
        setFormError(errorMessage(res.status, json));
        setPending(false);
        return;
      }
      const to =
        typeof json === 'object' &&
        json !== null &&
        'redirectTo' in json &&
        json.redirectTo === '/host'
          ? '/host'
          : '/';
      // The session token carries the account type the proxy reads; refresh it first.
      await session?.getToken({ skipCache: true }).catch(() => null);
      router.replace(to);
    } catch {
      setFormError('We could not reach Explore&Earn. Check your connection and try again.');
      setPending(false);
    }
  }

  function submitSeeker(e: FormEvent) {
    e.preventDefault();
    if (!adult) {
      setFieldError('Confirm you are 18 or older to continue.');
      return;
    }
    setFieldError(null);
    void submit({ accountType: 'seeker', adultAttested: true });
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

  const back =
    initialStep === 'choose' ? (
      <Button
        variant="ghost"
        onClick={() => go('choose')}
        disabled={pending}
        className="-ml-3 self-start px-3"
      >
        Back
      </Button>
    ) : null;

  if (step === 'seeker') {
    return (
      <form onSubmit={submitSeeker} noValidate className={`${card} flex flex-col gap-5`}>
        {back}
        <div className="flex flex-col gap-2">
          <h1 ref={headingRef} tabIndex={-1} className={heading}>
            Work worth going somewhere for.
          </h1>
          <p className="text-15 text-ink-2">
            Explore&amp;Earn is for adults. Confirm your age to start exploring jobs, some with
            housing and meals.
          </p>
        </div>
        <Checkbox
          name="adultAttested"
          label="I'm 18 or older"
          checked={adult}
          required
          onChange={(e) => {
            setAdult(e.target.checked);
            if (e.target.checked) setFieldError(null);
          }}
          error={fieldError}
        />
        {formError ? <FormError>{formError}</FormError> : null}
        <Button type="submit" size="lg" fullWidth loading={pending} icon={ArrowRight}>
          Continue
        </Button>
      </form>
    );
  }

  if (step === 'host') {
    return (
      <form onSubmit={submitHost} noValidate className={`${card} flex flex-col gap-5`}>
        {back}
        <div className="flex flex-col gap-2">
          <h1 ref={headingRef} tabIndex={-1} className={heading}>
            Name your organization
          </h1>
          <p className="text-15 text-ink-2">
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
        <p className="text-15 text-ink-2">
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
