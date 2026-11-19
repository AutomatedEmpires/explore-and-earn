'use client';

// Builder steps 1-3: Basics, Where and when, Pay (Figma 43:11198, 43:11384, 43:11521).
import { useState } from 'react';
import { GENRES } from '@/lib/taxonomy';
import { US_STATE_CODES } from '@/lib/us-states';
import { Button, Checkbox, Input, Notice, Select } from '@/ui/components';
import { Plus } from '@/ui/icons';
import { ApiError, api } from '../_lib/api';
import {
  formatDay,
  formatPayAmount,
  parseHours,
  parsePayAmount,
  parseWholeNumber,
} from '../_lib/format';
import { CATEGORY_LABEL, categoryOf, type CategoryCode } from '../_lib/model';
import { getPath, num, obj, str, strings } from '../_lib/paths';
import {
  ChoiceField,
  CheckField,
  RadioField,
  SwitchField,
  TextField,
  AreaField,
  fieldId,
  type Form,
} from './fields';

const CATEGORY_OPTIONS = (Object.entries(CATEGORY_LABEL) as [CategoryCode, string][]).map(
  ([value, label]) => ({ value, label }),
);

// --- 1 Basics ---------------------------------------------------------------------------------

export function BasicsSection({ form }: { form: Form }) {
  const category = categoryOf(form.draft);
  const genres = GENRES.filter((g) => g.category === category);
  const occupations = form.refs.occupations.filter(
    (o) => !category || o.categories.length === 0 || o.categories.includes(category),
  );
  const openings = num(getPath(form.draft, 'basics.openings'));
  const secondary = str(getPath(form.draft, 'basics.secondaryCategory'));
  const contractor = getPath(form.draft, 'basics.employmentType') === 'contractor';

  return (
    <>
      <TextField form={form} path="basics.title" label="Job title" required maxLength={80} />
      <ChoiceField
        form={form}
        path="basics.primaryCategory"
        label="Category"
        required
        options={CATEGORY_OPTIONS}
        onChoose={(v) => {
          if (v === category) return;
          const entries: [string, unknown][] = [
            ['basics.primaryCategory', v],
            ['basics.genre', undefined],
            ['genreDetails', { category: v }],
          ];
          // Remote jobs say who can apply instead of where the work is.
          const wasRemote = category === 'remote';
          if (wasRemote !== (v === 'remote')) {
            entries.push([
              'where',
              v === 'remote' ? { mode: 'remote', scope: 'all_us', states: [] } : { mode: 'onsite' },
            ]);
          }
          if (secondary === v) entries.push(['basics.secondaryCategory', null]);
          form.setMany(entries);
        }}
      />
      <ChoiceField
        form={form}
        path="basics.genre"
        label="Genre"
        required
        hint="Guests browse by genre."
        placeholder={category ? 'Choose one' : 'Choose a category first'}
        options={genres.map((g) => ({ value: g.code, label: g.label }))}
      />
      <Select
        id={fieldId('basics.secondaryCategory')}
        label="Second category"
        hint="Optional. Pick one only if the job is really both."
        options={[
          { value: 'none', label: 'None' },
          ...CATEGORY_OPTIONS.filter((o) => o.value !== category),
        ]}
        value={secondary ?? undefined}
        onValueChange={(v) => form.set('basics.secondaryCategory', v === 'none' ? null : v)}
      />
      <ChoiceField
        form={form}
        path="basics.occupationCode"
        label="Occupation"
        required
        hint="The role itself. Fit uses this."
        options={occupations.map((o) => ({ value: o.code, label: o.label }))}
      />
      <TextField
        form={form}
        path="basics.openings"
        label="Openings"
        required
        inputMode="numeric"
        text={{ key: 'basics.openings', shown: openings === undefined ? '' : String(openings) }}
        onText={(v) => {
          const n = parseWholeNumber(v);
          form.set('basics.openings', typeof n === 'number' ? n : undefined, {
            key: 'basics.openings',
            value: v,
          });
        }}
      />
      <RadioField
        form={form}
        path="basics.employmentType"
        legend="Type of work"
        required
        options={[
          { value: 'employee', label: 'Employee' },
          { value: 'contractor', label: 'Contractor' },
        ]}
      />
      {contractor ? (
        <Notice tone="info" title="Most seasonal staff are employees">
          Under federal and state law, calling an employee a contractor does not change that.
        </Notice>
      ) : null}
      <RadioField
        form={form}
        path="basics.schedule"
        legend="Hours"
        required
        options={[
          { value: 'full_time', label: 'Full time' },
          { value: 'part_time', label: 'Part time' },
        ]}
      />
    </>
  );
}

// --- 2 Where and when -------------------------------------------------------------------------

const SEASONS = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
  { value: 'year_round', label: 'All year' },
] as const;

const COMMITMENTS = [
  'No minimum',
  'The whole season',
  'At least 1 month',
  'At least 2 months',
  'At least 3 months',
] as const;

function AddLocation({ form, onAdded }: { form: Form; onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState('');
  const [state, setState] = useState<string | undefined>();
  const [line1, setLine1] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" icon={Plus} className="self-start" onClick={() => setOpen(true)}>
        Add a location
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
      <p className="text-16 font-bold text-ink">New location</p>
      <Input
        label="Street address"
        hint="Optional. Guests see the town only."
        value={line1}
        autoComplete="address-line1"
        onChange={(e) => setLine1(e.currentTarget.value)}
      />
      <Input
        label="Town or city"
        required
        value={city}
        autoComplete="address-level2"
        onChange={(e) => setCity(e.currentTarget.value)}
      />
      <Select
        label="State"
        required
        options={US_STATE_CODES.map((c) => ({ value: c, label: c }))}
        value={state}
        onValueChange={setState}
      />
      {error ? (
        <Notice tone="danger" announce="assertive" title="Couldn’t add the location">
          {error}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={busy}
          onClick={async () => {
            if (!city.trim() || !state) {
              setError('Add the town and the state.');
              return;
            }
            setBusy(true);
            setError(null);
            try {
              const loc = await api.addLocation({ city: city.trim(), state, line1: line1.trim() });
              form.addLocation({ id: loc.id, name: loc.name, city: loc.city, state: loc.state });
              onAdded(loc.id);
              setOpen(false);
            } catch (err) {
              setError(
                err instanceof ApiError && err.offline
                  ? 'You are offline. Try again when you are back.'
                  : err instanceof ApiError && err.code === 'forbidden'
                    ? 'Ask an Owner or Admin to add locations.'
                    : 'We couldn’t find that place. Check the town and state.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Add location
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function WhereWhenSection({ form }: { form: Form }) {
  const remote = categoryOf(form.draft) === 'remote';
  const where = obj(form.draft.where);
  const dates = obj(getPath(form.draft, 'when.dates'));
  const mode = str(dates.mode);
  const hours = num(getPath(form.draft, 'when.weeklyHours'));
  const year = num(dates.year);
  const locations = form.refs.locations;
  const locationPath = remote ? 'where.hostLocationId' : 'where.locationId';
  const chosen = locations?.find((l) => l.id === str(getPath(form.draft, locationPath)));
  const commitment = str(getPath(form.draft, 'when.minCommitment'));
  const end = str(dates.end);

  const locationField = (
    <div className="flex flex-col gap-3">
      <ChoiceField
        form={form}
        path={locationPath}
        label={remote ? 'Your business location' : 'Location'}
        required
        placeholder={locations === null ? 'Loading your locations' : 'Choose one'}
        hint={
          remote
            ? 'Where your business is. Guests see the state.'
            : 'A saved location. You can add a new one.'
        }
        options={(locations ?? []).map((l) => ({ value: l.id, label: `${l.city}, ${l.state}` }))}
      />
      <AddLocation form={form} onAdded={(id) => form.set(locationPath, id)} />
    </div>
  );

  return (
    <>
      {remote ? (
        <>
          <RadioField
            form={form}
            path="where.scope"
            legend="Who can apply"
            required
            value={(str(where.scope) as 'all_us' | 'states' | undefined) ?? 'all_us'}
            options={[
              { value: 'all_us', label: 'Anyone in the US' },
              { value: 'states', label: 'Only some states' },
            ]}
          />
          {where.scope === 'states' ? (
            <fieldset id={fieldId('where.states')} className="flex flex-col gap-1">
              <legend className="mb-1 text-14 font-semibold text-ink">States *</legend>
              <div className="grid max-h-72 grid-cols-3 overflow-y-auto rounded-lg border border-line bg-surface px-3">
                {US_STATE_CODES.map((code) => {
                  const states = strings(where.states);
                  return (
                    <Checkbox
                      key={code}
                      label={code}
                      checked={states.includes(code)}
                      onChange={(e) => {
                        const on = e.currentTarget.checked;
                        form.set(
                          'where.states',
                          on ? [...states, code] : states.filter((s) => s !== code),
                        );
                        form.touch('where.states');
                      }}
                    />
                  );
                })}
              </div>
              {form.error('where.states') ? (
                <p className="text-14 font-semibold text-danger">{form.error('where.states')}</p>
              ) : null}
            </fieldset>
          ) : null}
          {locationField}
        </>
      ) : (
        locationField
      )}
      {chosen?.state === 'CO' ? (
        <Notice tone="info" title="Colorado asks for a closing date">
          Add the date applications close in the Applying step.
        </Notice>
      ) : null}

      <RadioField
        form={form}
        path="when.dates.mode"
        legend="Dates"
        required
        options={[
          { value: 'fixed', label: 'Fixed dates' },
          { value: 'season', label: 'A season and year' },
          { value: 'ongoing', label: 'Ongoing' },
        ]}
        onChoose={(v) =>
          form.set('when.dates', v === 'ongoing' ? { mode: v, start: null } : { mode: v })
        }
      />
      {mode === 'fixed' ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} path="when.dates.start" label="First day" required type="date" />
          <TextField form={form} path="when.dates.end" label="Last day" required type="date" />
        </div>
      ) : null}
      {mode === 'season' ? (
        <div className="grid grid-cols-2 gap-3">
          <ChoiceField
            form={form}
            path="when.dates.season"
            label="Season"
            required
            options={SEASONS}
          />
          <TextField
            form={form}
            path="when.dates.year"
            label="Year"
            required
            inputMode="numeric"
            text={{ key: 'when.dates.year', shown: year === undefined ? '' : String(year) }}
            onText={(v) => {
              const n = parseWholeNumber(v);
              form.set('when.dates.year', typeof n === 'number' ? n : undefined, {
                key: 'when.dates.year',
                value: v,
              });
            }}
          />
        </div>
      ) : null}
      {mode === 'ongoing' ? (
        <TextField
          form={form}
          path="when.dates.start"
          label="First day"
          hint="Optional. Leave it empty to start as soon as you hire."
          type="date"
          onText={(v) => form.set('when.dates.start', v === '' ? null : v)}
        />
      ) : null}

      <TextField
        form={form}
        path="when.weeklyHours"
        label="Hours a week"
        required
        inputMode="decimal"
        hint="Guests see this on the listing."
        text={{ key: 'when.weeklyHours', shown: hours === undefined ? '' : String(hours) }}
        onText={(v) => {
          const n = parseHours(v);
          form.set('when.weeklyHours', typeof n === 'number' ? n : undefined, {
            key: 'when.weeklyHours',
            value: v,
          });
        }}
      />
      <Select
        id={fieldId('when.minCommitment')}
        label="Minimum commitment"
        options={COMMITMENTS.map((c) => ({ value: c, label: c }))}
        value={commitment ?? 'No minimum'}
        hint={
          commitment === 'The whole season' && mode === 'fixed' && end
            ? `Through ${formatDay(end)}`
            : undefined
        }
        onValueChange={(v) => form.set('when.minCommitment', v === 'No minimum' ? null : v)}
      />
    </>
  );
}

// --- 3 Pay -----------------------------------------------------------------------------------

const UNITS = [
  { value: 'hour', label: 'An hour' },
  { value: 'day', label: 'A day' },
  { value: 'week', label: 'A week' },
  { value: 'month', label: 'A month' },
  { value: 'season', label: 'A season' },
  { value: 'year', label: 'A year' },
  { value: 'crew_share', label: 'A crew share' },
] as const;

const FREQUENCIES = [
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Every month' },
  { value: 'end_of_season', label: 'At the end of the season' },
  { value: 'per_trip', label: 'After each trip' },
] as const;

/** Benefits that are perks on the listing (job.perks). */
const BENEFIT_PERKS = [
  { code: 'health_insurance', label: 'Health insurance' },
  { code: 'paid_time_off', label: 'Paid time off' },
  { code: 'retirement_plan', label: 'Retirement plan' },
] as const;

export function PaySection({ form }: { form: Form }) {
  const pay = obj(form.draft.pay);
  const crew = pay.unit === 'crew_share';
  const min = num(pay.minCents);
  const max = num(pay.maxCents);
  const shown =
    min !== undefined && max !== undefined
      ? formatPayAmount({
          kind: pay.kind === 'range' ? 'range' : 'fixed',
          minCents: min,
          maxCents: max,
        })
      : '';
  const perks = strings(getPath(form.draft, 'job.perks'));
  const bonusOn = form.raw['pay.bonusesOn'] === 'true' || typeof pay.bonuses === 'string';

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            form={form}
            path="pay.minCents"
            label={crew ? 'Estimated share' : 'Amount'}
            required
            inputMode="decimal"
            placeholder={crew ? '$8,000–$12,000' : '$18–$20'}
            text={{ key: 'pay.amount', shown }}
            onText={(v) => {
              const p = parsePayAmount(v);
              const entries: [string, unknown][] = [
                ['pay.kind', p ? p.kind : undefined],
                ['pay.minCents', p ? p.minCents : undefined],
                ['pay.maxCents', p ? p.maxCents : undefined],
              ];
              if (crew) {
                entries.push(['pay.crewShareEstimate.minCents', p ? p.minCents : undefined]);
                entries.push(['pay.crewShareEstimate.maxCents', p ? p.maxCents : undefined]);
              }
              form.setMany(entries, { key: 'pay.amount', value: v });
            }}
          />
          <ChoiceField
            form={form}
            path="pay.unit"
            label="Per"
            required
            options={UNITS}
            onChoose={(v) => {
              const entries: [string, unknown][] = [['pay.unit', v]];
              if (v === 'crew_share') {
                entries.push([
                  'pay.crewShareEstimate',
                  { minCents: min, maxCents: max, per: 'season' },
                ]);
              } else {
                entries.push(['pay.crewShareEstimate', null]);
              }
              form.setMany(entries);
            }}
          />
        </div>
        <p className="text-14 text-muted">
          Hour, day, week, month, season, year or crew share. Crew share asks for an estimated
          range.
        </p>
      </div>
      {crew ? (
        <ChoiceField
          form={form}
          path="pay.crewShareEstimate.per"
          errorKey="pay.crewPer"
          label="The estimate covers"
          required
          options={[
            { value: 'week', label: 'A week' },
            { value: 'month', label: 'A month' },
            { value: 'season', label: 'A season' },
          ]}
        />
      ) : null}
      <ChoiceField
        form={form}
        path="pay.frequency"
        label="How often you pay"
        required
        options={FREQUENCIES}
      />
      <SwitchField
        form={form}
        path="pay.overtime"
        label="Overtime is paid"
        description="Time and a half after 40 hours a week."
      />
      <fieldset className="flex flex-col">
        <legend className="mb-1 flex flex-col gap-1">
          <span className="text-14 font-semibold text-ink">Benefits and other pay</span>
          <span className="text-16 text-ink-2">
            Pick all that apply. Guests see this next to pay.
          </span>
        </legend>
        {BENEFIT_PERKS.map((b) => (
          <CheckField
            key={b.code}
            form={form}
            path="job.perks"
            label={b.label}
            checked={perks.includes(b.code)}
            onToggle={(on) =>
              form.set('job.perks', on ? [...perks, b.code] : perks.filter((p) => p !== b.code))
            }
          />
        ))}
        <CheckField
          form={form}
          path="pay.bonuses"
          label="Bonuses"
          checked={bonusOn}
          onToggle={(on) =>
            form.setMany([['pay.bonuses', on ? '' : null]], {
              key: 'pay.bonusesOn',
              value: String(on),
            })
          }
        />
        <CheckField form={form} path="pay.tips" label="Tips" />
      </fieldset>
      {bonusOn ? (
        <AreaField
          form={form}
          path="pay.bonuses"
          label="Tell guests about the bonus"
          hint="Up to 200 characters."
          rows={3}
          maxLength={200}
          onText={(v) => form.set('pay.bonuses', v)}
        />
      ) : null}
      <AreaField
        form={form}
        path="pay.deductions"
        label="Other deductions from pay"
        hint="Housing and meals go in their own steps. Add anything else you take from pay, like a uniform."
        rows={2}
        maxLength={200}
      />
    </>
  );
}
