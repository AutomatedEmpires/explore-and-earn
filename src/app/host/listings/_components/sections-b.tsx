'use client';

// Builder steps 4-6: Housing, Meals and the category's details (Figma 43:11643, 43:11940,
// 156:18098), with the housing and meal photo slots (PhotoSlot 155:5143).
import { Checkbox, Notice, Select } from '@/ui/components';
import { Bath, BedDouble, House, Image, Utensils, type IconComponent } from '@/ui/icons';
import type { PhotoKind } from '../_lib/api';
import { commaItems, dollars, parseMoney, parseWholeNumber } from '../_lib/format';
import { HOUSING_SLOTS, MEAL_SLOTS, SLOT_LABEL, categoryOf } from '../_lib/model';
import { getPath, num, obj, str, strings } from '../_lib/paths';
import {
  AreaField,
  CheckField,
  ChoiceField,
  GroupLabel,
  RadioField,
  SwitchField,
  TextField,
  fieldId,
  type Form,
} from './fields';
import { PhotoSlot } from './PhotoSlot';

const SLOT_ICON: Record<string, IconComponent> = {
  bedroom: BedDouble,
  bathroom: Bath,
  kitchen: Utensils,
  exterior: House,
  meal_example: Utensils,
  dining_area: Utensils,
  other: Image,
};

const SLOT_HINT: Record<string, string> = {
  bedroom: 'Hold the phone steady. The whole room should be in the picture.',
  bathroom: 'Show the shower, the sink and how clean it is.',
  kitchen: 'Show where staff cook or keep food.',
  exterior: 'Show the building from outside, as guests will see it.',
  meal_example: 'Show a real plate from the staff kitchen.',
  dining_area: 'Show where staff eat.',
  other: 'Anything else guests should see about meals.',
};

/** A required group of photo slots, with the notice for failed uploads. */
export function PhotoGroup({
  form,
  prefix,
  slots,
  label,
  group,
  kind,
}: {
  form: Form;
  prefix: 'housing' | 'meals';
  slots: readonly string[];
  label: string;
  group: string;
  kind: PhotoKind;
}) {
  const failed = slots.filter((s) => form.photos.failed.includes(`${prefix}.photos.${s}`));
  const missing = slots.filter((s) => form.error(`${prefix}.photos.${s}`));
  const action = form.phone ? 'Take photo' : 'Add photo';
  return (
    <div className="flex flex-col gap-3" id={fieldId(`${prefix}.photos`)}>
      <GroupLabel
        label={label}
        required
        hint="All four are required. Guests see them before they apply."
      />
      {failed.length > 0 ? (
        <Notice
          tone="danger"
          announce="assertive"
          title={`${failed.length} ${failed.length === 1 ? 'photo' : 'photos'} didn’t upload`}
        >
          The others are saved. Tap {failed.map((s) => SLOT_LABEL[s]).join(' and ')} to try again.
        </Notice>
      ) : missing.length > 0 ? (
        <p className="text-14 font-semibold text-danger">
          Add {missing.map((s) => SLOT_LABEL[s]?.toLowerCase()).join(', ')}.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {slots.map((slot) => {
          const path = `${prefix}.photos.${slot}`;
          const name = SLOT_LABEL[slot] ?? slot;
          return (
            <PhotoSlot
              key={slot}
              label={name}
              icon={SLOT_ICON[slot] ?? Image}
              action={action}
              state={form.photos.slot(path)}
              onPick={() => {
                form.photos.pick({ path, label: name, group, kind, hint: SLOT_HINT[slot] ?? '' });
                form.touch(path);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

const PERIODS = [
  { value: 'day', label: 'A night' },
  { value: 'week', label: 'A week' },
  { value: 'month', label: 'A month' },
  { value: 'season', label: 'A season' },
] as const;

/** Free, or an amount with its period and whether it is taken from pay. */
function CostFields({ form, prefix }: { form: Form; prefix: 'housing' | 'meals' }) {
  const cost = obj(getPath(form.draft, `${prefix}.cost`));
  const choice = cost.free === true ? 'free' : cost.free === false ? 'amount' : undefined;
  const cents = num(cost.cents);
  return (
    <>
      <RadioField
        form={form}
        path={`${prefix}.cost.free`}
        legend="Cost"
        required
        value={choice}
        options={[
          { value: 'free', label: 'Free' },
          { value: 'amount', label: 'An amount' },
        ]}
        onChoose={(v) =>
          form.set(`${prefix}.cost`, v === 'free' ? { free: true } : { ...cost, free: false })
        }
      />
      {choice === 'amount' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                form={form}
                path={`${prefix}.cost.cents`}
                label="Amount"
                required
                inputMode="decimal"
                placeholder="$110"
                text={{ key: `${prefix}.cost.amount`, shown: cents ? `$${dollars(cents)}` : '' }}
                onText={(v) => {
                  const c = parseMoney(v);
                  form.set(`${prefix}.cost.cents`, typeof c === 'number' ? c : undefined, {
                    key: `${prefix}.cost.amount`,
                    value: v,
                  });
                }}
              />
              <ChoiceField
                form={form}
                path={`${prefix}.cost.period`}
                label="Per"
                required
                options={PERIODS}
              />
            </div>
            <p className="text-14 text-muted">A night, week, month or season.</p>
          </div>
          <RadioField
            form={form}
            path={`${prefix}.cost.paidBy`}
            legend="How is it paid?"
            required
            options={[
              { value: 'deducted', label: 'Taken from pay' },
              { value: 'direct', label: 'Paid to us separately' },
            ]}
          />
        </>
      ) : null}
    </>
  );
}

// --- 4 Housing -------------------------------------------------------------------------------

const HOUSING_TYPES = [
  { value: 'dorm', label: 'Dorm bed' },
  { value: 'shared_room', label: 'Shared room' },
  { value: 'private_room', label: 'Private room' },
  { value: 'cabin', label: 'Cabin' },
  { value: 'rv_site', label: 'RV site' },
  { value: 'berth', label: 'Berth on a boat' },
] as const;

export function HousingSection({ form }: { form: Form }) {
  const provided = getPath(form.draft, 'housing.provided') === true;
  const roommates = num(getPath(form.draft, 'housing.finePrint.roommates'));
  return (
    <>
      <SwitchField
        form={form}
        path="housing.provided"
        label="Housing is provided"
        onToggle={(on) => form.set('housing.provided', on)}
      />
      {provided ? (
        <>
          <RadioField
            form={form}
            path="housing.type"
            legend="Type of housing"
            required
            options={HOUSING_TYPES}
          />
          <CostFields form={form} prefix="housing" />
          <CheckField
            form={form}
            path="housing.finePrint.couples"
            label="Couples can share one room"
            description="Guests see “Couples housed” on the card."
          />
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-14 font-semibold text-ink">What comes with it</legend>
            <CheckField form={form} path="housing.finePrint.wifi" label="Wi-Fi" />
            <CheckField
              form={form}
              path="housing.finePrint.utilitiesIncluded"
              label="Utilities included"
            />
            <CheckField form={form} path="housing.finePrint.pets" label="Pets allowed" />
          </fieldset>
          <TextField
            form={form}
            path="housing.finePrint.roommates"
            label="Roommates per room"
            hint="Optional. Leave it empty if it depends."
            inputMode="numeric"
            text={{
              key: 'housing.finePrint.roommates',
              shown: roommates === undefined || roommates === null ? '' : String(roommates),
            }}
            onText={(v) => {
              const n = parseWholeNumber(v);
              form.set('housing.finePrint.roommates', typeof n === 'number' ? n : null, {
                key: 'housing.finePrint.roommates',
                value: v,
              });
            }}
          />
          <TextField
            form={form}
            path="housing.note"
            label="Short note for the card"
            maxLength={80}
            hint="Up to 80 characters."
          />
          <AreaField
            form={form}
            path="housing.finePrint.notes"
            label="Fine print"
            hint="House rules and anything else guests should know."
            rows={3}
            maxLength={1000}
          />
          <PhotoGroup
            form={form}
            prefix="housing"
            slots={HOUSING_SLOTS}
            label="Housing photos"
            group="Housing photo"
            kind="housing_photo"
          />
        </>
      ) : (
        <p className="text-16 text-ink-2">Guests see “No housing” on the card.</p>
      )}
    </>
  );
}

// --- 5 Meals ---------------------------------------------------------------------------------

export function MealsSection({ form }: { form: Form }) {
  const provided = getPath(form.draft, 'meals.provided') === true;
  const perDay = num(getPath(form.draft, 'meals.perDay'));
  return (
    <>
      <SwitchField
        form={form}
        path="meals.provided"
        label="Meals are provided"
        onToggle={(on) => form.set('meals.provided', on)}
      />
      {provided ? (
        <>
          <TextField
            form={form}
            path="meals.perDay"
            label="Meals a day"
            required
            inputMode="numeric"
            hint="1, 2 or 3."
            text={{ key: 'meals.perDay', shown: perDay === undefined ? '' : String(perDay) }}
            onText={(v) => {
              const n = parseWholeNumber(v);
              form.set('meals.perDay', n === 1 || n === 2 || n === 3 ? n : undefined, {
                key: 'meals.perDay',
                value: v,
              });
            }}
          />
          <RadioField
            form={form}
            path="meals.days"
            legend="Which days"
            required
            options={[
              { value: 'work_days', label: 'Work days' },
              { value: 'every_day', label: 'Every day, days off too' },
            ]}
          />
          <CostFields form={form} prefix="meals" />
          <TextField
            form={form}
            path="meals.note"
            label="Short note for the card"
            maxLength={80}
            hint="Up to 80 characters."
          />
          <AreaField
            form={form}
            path="meals.dietary"
            label="Fine print"
            hint="Dietary needs and anything guests should know."
            rows={3}
            maxLength={200}
          />
          <PhotoGroup
            form={form}
            prefix="meals"
            slots={MEAL_SLOTS}
            label="Meal photos"
            group="Meal photo"
            kind="meal_photo"
          />
        </>
      ) : (
        <p className="text-16 text-ink-2">Guests see “No meals” on the card.</p>
      )}
    </>
  );
}

// --- 6 Category details ----------------------------------------------------------------------

const STAFF_PERKS = [
  'Free park pass',
  'Staff events and trips',
  'Gear and shop discounts',
  'Shuttle to town',
] as const;

function ListField({
  form,
  path,
  label,
  hint,
}: {
  form: Form;
  path: string;
  label: string;
  hint?: string;
}) {
  return (
    <TextField
      form={form}
      path={path}
      label={label}
      hint={hint ?? 'Separate them with commas.'}
      text={{ key: path, shown: strings(getPath(form.draft, path)).join(', ') }}
      onText={(v) => form.set(path, commaItems(v), { key: path, value: v })}
    />
  );
}

export function GenreDetailsSection({ form }: { form: Form }) {
  const category = categoryOf(form.draft);
  const g = obj(form.draft.genreDetails);

  if (category === 'seasonal') {
    const perks = strings(g.staffPerks);
    const extra = perks.filter((p) => !(STAFF_PERKS as readonly string[]).includes(p));
    return (
      <>
        <Select
          id={fieldId('genreDetails.destinationSlug')}
          label="Destination"
          hint="Links the job to the destination page."
          options={[
            { value: 'none', label: 'No destination' },
            ...form.refs.destinations.map((d) => ({ value: d.slug, label: d.name })),
          ]}
          value={str(g.destinationSlug) ?? undefined}
          onValueChange={(v) => form.set('genreDetails.destinationSlug', v === 'none' ? null : v)}
        />
        <fieldset className="flex flex-col">
          <legend className="mb-1 flex flex-col gap-1">
            <span className="text-14 font-semibold text-ink">Staff perks</span>
            <span className="text-14 text-muted">Guests see these as perks.</span>
          </legend>
          {[...STAFF_PERKS, ...extra].map((perk) => (
            <Checkbox
              key={perk}
              label={perk}
              checked={perks.includes(perk)}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                form.set(
                  'genreDetails.staffPerks',
                  on ? [...perks, perk] : perks.filter((p) => p !== perk),
                );
              }}
            />
          ))}
        </fieldset>
      </>
    );
  }

  if (category === 'maritime') {
    const docs = strings(g.documents);
    return (
      <>
        <TextField
          form={form}
          path="genreDetails.vesselType"
          label="Vessel"
          required
          placeholder="58 ft longliner"
        />
        <TextField
          form={form}
          path="genreDetails.homePort"
          label="Home port"
          required
          placeholder="Kodiak, AK"
        />
        <TextField
          form={form}
          path="genreDetails.rotation"
          label="Rotation"
          placeholder="3 weeks on, 1 off"
          onText={(v) => form.set('genreDetails.rotation', v === '' ? null : v)}
        />
        <TextField
          form={form}
          path="genreDetails.timeAtSea"
          label="Time at sea"
          placeholder="Trips of 5 to 10 days"
          onText={(v) => form.set('genreDetails.timeAtSea', v === '' ? null : v)}
        />
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-14 font-semibold text-ink">Documents guests need</legend>
          {(['twic', 'mmc', 'stcw'] as const).map((d) => (
            <Checkbox
              key={d}
              label={d.toUpperCase()}
              checked={docs.includes(d)}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                form.set('genreDetails.documents', on ? [...docs, d] : docs.filter((x) => x !== d));
              }}
            />
          ))}
        </fieldset>
      </>
    );
  }

  if (category === 'farm') {
    return (
      <>
        <TextField
          form={form}
          path="genreDetails.operationType"
          label="Type of farm"
          required
          placeholder="Apple orchard"
        />
        <TextField
          form={form}
          path="genreDetails.harvestWindow"
          label="Harvest window"
          placeholder="Late August to October"
          onText={(v) => form.set('genreDetails.harvestWindow', v === '' ? null : v)}
        />
        <ListField form={form} path="genreDetails.equipment" label="Equipment" />
        <ListField form={form} path="genreDetails.certifications" label="Certifications" />
      </>
    );
  }

  if (category === 'remote') {
    return (
      <>
        <TextField
          form={form}
          path="genreDetails.timeZoneOverlap"
          label="Hours you work together"
          required
          placeholder="9 AM to 1 PM Mountain"
        />
        <TextField
          form={form}
          path="genreDetails.equipmentProvided"
          label="Equipment provided"
          placeholder="Laptop and headset"
          onText={(v) => form.set('genreDetails.equipmentProvided', v === '' ? null : v)}
        />
        <TextField
          form={form}
          path="genreDetails.internet"
          label="Internet needed"
          placeholder="25 Mbps"
          onText={(v) => form.set('genreDetails.internet', v === '' ? null : v)}
        />
        <RadioField
          form={form}
          path="genreDetails.travel"
          legend="Travel"
          required
          options={[
            { value: 'none', label: 'None' },
            { value: 'occasional', label: 'Now and then' },
            { value: 'regular', label: 'Regular' },
          ]}
        />
      </>
    );
  }

  return (
    <Notice tone="info" title="Choose a category first">
      These questions depend on the category you pick in Basics.
    </Notice>
  );
}
