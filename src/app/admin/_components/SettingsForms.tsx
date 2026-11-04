'use client';

import { useState, type ReactNode } from 'react';
import {
  SETTING_DEFAULTS,
  type SettingKey,
  type SettingValues,
  type Thresholds,
} from '@/modules/settings';
import { Button, Input, Textarea } from '@/ui/components';
import { updateSetting } from '../actions';
import { ActionMessage } from './ActionMessage';
import { useConsoleAction } from './use-console-action';

const FALLBACK_THRESHOLD: Thresholds = { approveBelow: 0.2, rejectAtOrAbove: 0.9 };

/** A stored kind, else the registry default. Kinds are an open map, so an entry can be absent. */
function threshold(values: SettingValues, kind: string): Thresholds {
  return (
    values['trust.thresholds'][kind] ??
    SETTING_DEFAULTS['trust.thresholds'][kind] ??
    FALLBACK_THRESHOLD
  );
}

/** One setting's form: its fields, a Save button and the result. */
function SettingForm({
  settingKey,
  title,
  description,
  canEdit,
  toValue,
  children,
}: {
  settingKey: SettingKey;
  title: string;
  description: string;
  canEdit: boolean;
  /** The value to save, or an error message for the form. */
  toValue: () => { value: unknown } | { error: string };
  children: ReactNode;
}) {
  const { run, pending, result } = useConsoleAction(updateSetting);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4 border-b border-line px-5 py-6 last:border-b-0"
      onSubmit={(e) => {
        e.preventDefault();
        const next = toValue();
        if ('error' in next) {
          setError(next.error);
          return;
        }
        setError(null);
        void run(settingKey, next.value);
      }}
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-16 font-bold text-ink">{title}</h3>
        <p className="text-14 text-muted">{description}</p>
      </div>
      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-4">
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
      {canEdit ? (
        <div>
          <Button type="submit" variant="secondary" loading={pending}>
            Save
          </Button>
          <ActionMessage result={error ? { ok: false, error } : result} />
        </div>
      ) : null}
    </form>
  );
}

const number = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));

/** "20" (percent) to 0.2, or null. */
function fromPercent(s: string): number | null {
  const n = number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 10000 : null;
}

const toPercent = (fraction: number) => String(Math.round(fraction * 10000) / 100);

function ThresholdFields({
  label,
  approve,
  reject,
  onApprove,
  onReject,
}: {
  label: string;
  approve: string;
  reject: string;
  onApprove: (v: string) => void;
  onReject: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input
        label={`${label}: approve below (%)`}
        inputMode="decimal"
        value={approve}
        onChange={(e) => onApprove(e.target.value)}
      />
      <Input
        label={`${label}: reject at or above (%)`}
        inputMode="decimal"
        value={reject}
        onChange={(e) => onReject(e.target.value)}
      />
    </div>
  );
}

/** A typed form per setting (settings registry). Saving needs a recent sign-in confirmation. */
export function SettingsForms({ values, canEdit }: { values: SettingValues; canEdit: boolean }) {
  const [invites, setInvites] = useState(String(values['limits.invites_per_seeker_per_week']));
  const image = threshold(values, 'image_safety');
  const text = threshold(values, 'text_safety');
  const [t, setT] = useState({
    imageApprove: toPercent(image.approveBelow),
    imageReject: toPercent(image.rejectAtOrAbove),
    textApprove: toPercent(text.approveBelow),
    textReject: toPercent(text.rejectAtOrAbove),
  });
  const [sampleRate, setSampleRate] = useState(toPercent(values['trust.audit_sample_rate']));
  const [address, setAddress] = useState(values['business.mailing_address']);
  const [supportEmail, setSupportEmail] = useState(values['business.support_email']);
  const [signOff, setSignOff] = useState(String(values['ops.second_signoff_refund_cents'] / 100));

  return (
    <div className="flex flex-col">
      <SettingForm
        settingKey="limits.invites_per_seeker_per_week"
        title="Invites per seeker per week"
        description="How many job invitations one seeker can receive in a week."
        canEdit={canEdit}
        toValue={() => {
          const n = number(invites);
          return Number.isInteger(n) && n >= 0 && n <= 1000
            ? { value: n }
            : { error: 'Enter a whole number from 0 to 1,000' };
        }}
      >
        <Input
          label="Invites per week"
          inputMode="numeric"
          value={invites}
          onChange={(e) => setInvites(e.target.value)}
          fieldClassName="sm:w-64"
        />
      </SettingForm>

      <SettingForm
        settingKey="trust.thresholds"
        title="AI check thresholds"
        description="Scores below the first number are approved automatically, scores at or above the second are rejected, and everything between goes to a person."
        canEdit={canEdit}
        toValue={() => {
          const parts = [t.imageApprove, t.imageReject, t.textApprove, t.textReject].map(
            fromPercent,
          );
          if (parts.some((p) => p === null)) return { error: 'Enter percentages from 0 to 100' };
          const [ia, ir, ta, tr] = parts as number[];
          if ((ia ?? 0) > (ir ?? 0) || (ta ?? 0) > (tr ?? 0)) {
            return { error: 'The approve number must not be above the reject number' };
          }
          const value: SettingValues['trust.thresholds'] = {
            ...values['trust.thresholds'],
            image_safety: { approveBelow: ia ?? 0, rejectAtOrAbove: ir ?? 0 },
            text_safety: { approveBelow: ta ?? 0, rejectAtOrAbove: tr ?? 0 },
          };
          return { value };
        }}
      >
        <ThresholdFields
          label="Images"
          approve={t.imageApprove}
          reject={t.imageReject}
          onApprove={(v) => setT({ ...t, imageApprove: v })}
          onReject={(v) => setT({ ...t, imageReject: v })}
        />
        <ThresholdFields
          label="Text"
          approve={t.textApprove}
          reject={t.textReject}
          onApprove={(v) => setT({ ...t, textApprove: v })}
          onReject={(v) => setT({ ...t, textReject: v })}
        />
      </SettingForm>

      <SettingForm
        settingKey="trust.audit_sample_rate"
        title="Accuracy sample"
        description="The share of last week's automatic decisions copied into the Accuracy samples queue every Monday."
        canEdit={canEdit}
        toValue={() => {
          const rate = fromPercent(sampleRate);
          return rate === null ? { error: 'Enter a percentage from 0 to 100' } : { value: rate };
        }}
      >
        <Input
          label="Sample (%)"
          inputMode="decimal"
          value={sampleRate}
          onChange={(e) => setSampleRate(e.target.value)}
          fieldClassName="sm:w-64"
        />
      </SettingForm>

      <SettingForm
        settingKey="business.mailing_address"
        title="Mailing address"
        description="Shown in the footer of every email, as the law on commercial email requires."
        canEdit={canEdit}
        toValue={() => ({ value: address.trim() })}
      >
        <Textarea
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={500}
          rows={3}
        />
      </SettingForm>

      <SettingForm
        settingKey="business.support_email"
        title="Support email"
        description="Where people can write to a person."
        canEdit={canEdit}
        toValue={() => ({ value: supportEmail.trim() })}
      >
        <Input
          label="Email"
          type="email"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          fieldClassName="sm:w-96"
        />
      </SettingForm>

      <SettingForm
        settingKey="ops.second_signoff_refund_cents"
        title="Refunds that need a second operator"
        description="Once there are two or more operators, a refund above this amount waits for a second operator to approve it."
        canEdit={canEdit}
        toValue={() => {
          const dollars = number(signOff.replace(/[$,]/g, ''));
          return Number.isFinite(dollars) && dollars >= 0
            ? { value: Math.round(dollars * 100) }
            : { error: 'Enter an amount in dollars, for example 500' };
        }}
      >
        <Input
          label="Amount (USD)"
          inputMode="decimal"
          value={signOff}
          onChange={(e) => setSignOff(e.target.value)}
          fieldClassName="sm:w-64"
        />
      </SettingForm>
    </div>
  );
}
