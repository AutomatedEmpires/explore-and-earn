'use client';

// Builder steps 7-9: The job, Photos and Applying (Figma 43:12041, 156:18301, 156:18601).
import { useState } from 'react';
import { Button, Checkbox, Notice, Select } from '@/ui/components';
import { Image, Plus, Sparkles } from '@/ui/icons';
import { ApiError, api } from '../_lib/api';
import { commaItems, lines } from '../_lib/format';
import { DESCRIPTION_MIN, GALLERY_MAX, QUESTIONS_MAX } from '../_lib/model';
import { arr, getPath, obj, str, strings, type Json } from '../_lib/paths';
import {
  AreaField,
  CheckField,
  ChoiceField,
  GroupLabel,
  SwitchField,
  TextField,
  fieldId,
  type Form,
} from './fields';
import { PhotoSlot } from './PhotoSlot';

// --- 7 The job -------------------------------------------------------------------------------

const VISA = [
  { value: 'none', label: 'Not available' },
  { value: 'j1', label: 'J-1 through a sponsor organization' },
  { value: 'h2a', label: 'H-2A' },
  { value: 'h2b', label: 'H-2B' },
] as const;

export function JobSection({ form }: { form: Form }) {
  const description = str(getPath(form.draft, 'job.description')) ?? '';
  const notes = lines(description);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const listField = (path: string, split: (v: string) => string[], join: string) => ({
    text: { key: path, shown: strings(getPath(form.draft, path)).join(join) },
    onText: (v: string) => form.set(path, split(v), { key: path, value: v }),
  });

  return (
    <>
      <div className="flex flex-col gap-2">
        <AreaField
          form={form}
          path="job.description"
          label="Description"
          required
          rows={5}
          maxLength={10_000}
          hint={`${description.trim().length} of at least ${DESCRIPTION_MIN} characters.`}
          onText={(v) => form.set('job.description', v)}
        />
        {notes.length >= 1 && notes.length <= 20 ? (
          <Button
            variant="secondary"
            icon={Sparkles}
            className="self-start"
            loading={drafting}
            onClick={async () => {
              setDrafting(true);
              setDraftError(null);
              try {
                const r = await api.describe(
                  form.listingId,
                  notes.map((n) => n.slice(0, 500)),
                );
                form.set('job.description', r.description);
              } catch (err) {
                setDraftError(
                  err instanceof ApiError && err.offline
                    ? 'You are offline. Your notes are still here.'
                    : 'We couldn’t draft it right now. Your notes are still here; you can write it yourself.',
                );
              } finally {
                setDrafting(false);
              }
            }}
          >
            Draft it from my notes
          </Button>
        ) : null}
        {draftError ? (
          <Notice tone="danger" announce="assertive" title="No draft this time">
            {draftError}
          </Notice>
        ) : null}
      </div>
      <AreaField
        form={form}
        path="job.typicalDay"
        label="A typical day"
        rows={3}
        maxLength={2000}
      />
      <AreaField
        form={form}
        path="job.requiredQualifications"
        label="Required qualifications"
        required
        hint="One per line."
        rows={2}
        {...listField('job.requiredQualifications', lines, '\n')}
      />
      <AreaField
        form={form}
        path="job.preferredQualifications"
        label="Preferred qualifications"
        hint="Optional. One per line."
        rows={2}
        {...listField('job.preferredQualifications', lines, '\n')}
      />
      <TextField
        form={form}
        path="job.skills"
        label="Skills"
        required
        hint="Separate them with commas. These help us show the job to the right people."
        {...listField('job.skills', commaItems, ', ')}
      />
      <TextField
        form={form}
        path="job.certifications"
        label="Certifications"
        placeholder="None needed"
        hint="Optional. Separate them with commas."
        {...listField('job.certifications', commaItems, ', ')}
      />
      <div className="flex flex-col gap-1.5">
        <TextField
          form={form}
          path="job.physicalDemands"
          label="Physical demands"
          placeholder="On your feet, lifts up to 25 lb"
          maxLength={1000}
          onText={(v) => form.set('job.physicalDemands', v === '' ? null : v)}
        />
        <p className="text-14 text-muted">
          Minimum age: 18. Everyone on Explore&amp;Earn is 18 or older.
        </p>
      </div>
      <ChoiceField
        form={form}
        path="job.visaSponsorship"
        label="Visa sponsorship"
        required
        options={VISA}
        hint="A listing here does not replace the recruiting steps the Department of Labor requires."
      />
    </>
  );
}

// --- 8 Photos --------------------------------------------------------------------------------

export function PhotosSection({ form }: { form: Form }) {
  const gallery = strings(getPath(form.draft, 'photos.galleryMediaIds'));
  const action = form.phone ? 'Take photo' : 'Add photo';
  const coverError = form.error('photos.coverMediaId');
  return (
    <>
      <div className="flex flex-col gap-2" id={fieldId('photos.coverMediaId')}>
        <GroupLabel label="Cover" required hint="The photo guests see first." />
        <PhotoSlot
          wide
          label="Cover"
          icon={Image}
          action={action}
          state={form.photos.slot('photos.coverMediaId')}
          onPick={() => {
            form.photos.pick({
              path: 'photos.coverMediaId',
              label: 'Cover',
              group: 'Listing photo',
              kind: 'listing_photo',
              hint: 'Pick the photo guests see first: the place, the view or the team at work.',
            });
            form.touch('photos.coverMediaId');
          }}
        />
        {coverError ? <p className="text-14 font-semibold text-danger">{coverError}</p> : null}
      </div>
      <div className="flex flex-col gap-3">
        <GroupLabel label="Gallery" hint={`Optional. ${gallery.length} of ${GALLERY_MAX} added.`} />
        <div className="grid grid-cols-2 gap-3">
          {gallery.map((id, i) => (
            <div key={id} className="flex flex-col gap-1">
              <PhotoSlot
                label={`Photo ${i + 1}`}
                icon={Image}
                action={action}
                state={form.photos.slot(`photos.galleryMediaIds.${i}`)}
                onPick={() =>
                  form.photos.pick({
                    path: `photos.galleryMediaIds.${i}`,
                    label: `Photo ${i + 1}`,
                    group: 'Listing photo',
                    kind: 'listing_photo',
                    hint: 'The place, the team or the work.',
                  })
                }
              />
              <Button
                variant="ghost"
                className="self-start"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() =>
                  form.set(
                    'photos.galleryMediaIds',
                    gallery.filter((g) => g !== id),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
          {gallery.length < GALLERY_MAX ? (
            <PhotoSlot
              label="Add photo"
              icon={Image}
              action={form.phone ? 'Take photo' : 'Choose a file'}
              state={form.photos.slot('photos.galleryMediaIds')}
              onPick={() =>
                form.photos.pick({
                  path: 'photos.galleryMediaIds',
                  label: 'Gallery photo',
                  group: 'Listing photo',
                  kind: 'listing_photo',
                  hint: 'The place, the team or the work.',
                })
              }
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

// --- 9 Applying ------------------------------------------------------------------------------

const ANSWER_TYPES = [
  { value: 'short_answer', label: 'Short answer' },
  { value: 'yes_no', label: 'Yes or no' },
  { value: 'multiple_choice', label: 'Multiple choice' },
] as const;

const newQuestionId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function Question({
  form,
  index,
  question,
  onRemove,
}: {
  form: Form;
  index: number;
  question: Json;
  onRemove: () => void;
}) {
  const base = `applying.questions.${index}`;
  const type = str(question.type) ?? 'short_answer';
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
      <TextField form={form} path={`${base}.prompt`} label="Question" required maxLength={200} />
      <Select
        id={fieldId(`${base}.type`)}
        label="Answer type"
        required
        options={ANSWER_TYPES}
        value={type as (typeof ANSWER_TYPES)[number]['value']}
        onValueChange={(v) =>
          form.set(
            base,
            v === 'multiple_choice'
              ? {
                  ...question,
                  type: v,
                  choices: strings(question.choices),
                  allowMultiple: question.allowMultiple === true,
                }
              : {
                  id: question.id,
                  prompt: question.prompt ?? '',
                  required: question.required === true,
                  type: v,
                },
          )
        }
      />
      {type === 'multiple_choice' ? (
        <>
          <AreaField
            form={form}
            path={`${base}.choices`}
            label="Answers"
            required
            hint="One per line, 2 to 10."
            rows={3}
            text={{ key: `${base}.choices`, shown: strings(question.choices).join('\n') }}
            onText={(v) =>
              form.set(`${base}.choices`, lines(v), { key: `${base}.choices`, value: v })
            }
          />
          <CheckField
            form={form}
            path={`${base}.allowMultiple`}
            label="Guests can pick more than one"
          />
        </>
      ) : null}
      <SwitchField
        form={form}
        path={`${base}.required`}
        label="Required"
        description="A guest must answer before sending."
      />
      <Button
        variant="ghost"
        className="self-start"
        aria-label={`Remove question ${index + 1}`}
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}

export function ApplyingSection({ form }: { form: Form }) {
  const questions = arr(getPath(form.draft, 'applying.questions')).map(obj);
  const notify = strings(getPath(form.draft, 'applying.notifyMemberIds'));
  const url = str(getPath(form.draft, 'applying.additionalStep.url')) ?? '';
  const team = form.refs.team;
  return (
    <>
      <div className="flex flex-col gap-3">
        <GroupLabel
          label="Screening questions"
          hint={`${questions.length} of ${QUESTIONS_MAX}. Short answer, yes or no, or multiple choice. Each one can be required.`}
        />
        {questions.map((q, i) => (
          <Question
            key={str(q.id) ?? i}
            form={form}
            index={i}
            question={q}
            onRemove={() =>
              form.set(
                'applying.questions',
                questions.filter((_, j) => j !== i),
              )
            }
          />
        ))}
        {questions.length < QUESTIONS_MAX ? (
          <Button
            variant="secondary"
            icon={Plus}
            className="self-start"
            onClick={() =>
              form.set('applying.questions', [
                ...questions,
                { id: newQuestionId(), prompt: '', type: 'short_answer', required: false },
              ])
            }
          >
            Add a question
          </Button>
        ) : null}
      </div>
      <TextField
        form={form}
        path="applying.additionalStep.url"
        label="Additional step link"
        type="url"
        inputMode="url"
        placeholder="https://"
        hint="Optional. A form on your site. Guests see a notice before it opens."
        text={{ key: 'applying.additionalStep.url', shown: url }}
        onText={(v) =>
          form.set(
            'applying.additionalStep',
            v.trim() === '' ? null : { url: v.trim(), note: '' },
            {
              key: 'applying.additionalStep.url',
              value: v,
            },
          )
        }
      />
      <TextField
        form={form}
        path="applying.deadline"
        label="Applications close"
        type="date"
        hint="Optional. Leave it empty to keep hiring until filled."
        onText={(v) => form.set('applying.deadline', v === '' ? null : v)}
      />
      <fieldset className="flex flex-col">
        <legend className="mb-1 text-14 font-semibold text-ink">Who gets notified</legend>
        {team === null ? (
          <p className="text-16 text-muted">Loading your team</p>
        ) : (
          (team.length > 0
            ? team
            : [{ userId: form.ctx.viewerUserId, displayName: 'You', email: null }]
          ).map((m) => {
            const name = m.displayName ?? m.email ?? 'Team member';
            const you = m.userId === form.ctx.viewerUserId;
            return (
              <Checkbox
                key={m.userId}
                label={you && name !== 'You' ? `${name} (you)` : name}
                checked={notify.includes(m.userId)}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  form.set(
                    'applying.notifyMemberIds',
                    on ? [...notify, m.userId] : notify.filter((n) => n !== m.userId),
                  );
                }}
              />
            );
          })
        )}
      </fieldset>
    </>
  );
}
