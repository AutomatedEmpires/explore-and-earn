// trust.runCheck: classify a subject with Claude, apply the operator-set thresholds, store the
// result, and send anything uncertain to the moderation queue.
//
// Fail closed (Review Focus 5): if the classifier errors, times out, or answers in the wrong
// shape, the decision is needs_review with reason 'classifier_error'. Nothing is ever approved
// without a valid classifier answer.
import { z } from 'zod';
import { CLASSIFIER_MODEL, ClassifierError, classify, type ClassifyContent } from '@/lib/ai';
import type { DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { badRequest } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { getSetting } from '@/modules/settings';
import { transact } from './internal';
import * as imageSafetyPrompt from './prompts/image_safety';
import * as textSafetyPrompt from './prompts/text_safety';
import { openReviewItem } from './routing';
import { trustChecks } from './schema';
import type { CheckDecision, CheckKind, CheckResult, RunCheckInput } from './types';

/** The reason stored (and returned) when the classifier gave no usable answer. */
export const CLASSIFIER_ERROR = 'classifier_error';

const safety = z.object({
  score: z.number().min(0).max(1),
  labels: z.array(z.string()),
  reason: z.string(),
});

const imageSafety = safety.extend({ altText: z.string() });

type SafetyOutput = z.infer<typeof safety> & { altText?: string };

const KINDS: Record<
  CheckKind,
  { prompt: { version: string; system: string }; schema: z.ZodType<SafetyOutput> }
> = {
  text_safety: { prompt: textSafetyPrompt, schema: safety },
  image_safety: { prompt: imageSafetyPrompt, schema: imageSafety },
};

const MAX_LABELS = 10;
const MAX_LABEL_LENGTH = 40;
const MAX_REASON_LENGTH = 500;
const MAX_ALT_TEXT_LENGTH = 250;
const MAX_ERROR_LENGTH = 500;

/** Keeps submitted text from closing the tag it is wrapped in. */
function wrapSubmittedText(text: string): string {
  const safe = text.replace(/<(\/?)submitted_text/gi, '&lt;$1submitted_text');
  return `<submitted_text>\n${safe}\n</submitted_text>`;
}

function buildContent(i: RunCheckInput): ClassifyContent[] {
  const text = i.text?.trim() ? i.text : undefined;
  if (i.kind === 'text_safety') {
    if (!text) throw badRequest('text_safety needs non-empty text');
    return [{ type: 'text', text: wrapSubmittedText(text) }];
  }
  if (!i.image || i.image.bytes.length === 0) throw badRequest('image_safety needs an image');
  const instruction = text
    ? `Classify the image above. Text sent with it:\n${wrapSubmittedText(text)}`
    : 'Classify the image above.';
  return [
    { type: 'image', mime: i.image.mime, bytes: i.image.bytes },
    { type: 'text', text: instruction },
  ];
}

function normalizeLabels(labels: string[]): string[] {
  const out = new Set<string>();
  for (const label of labels) {
    const l = label.trim().toLowerCase().slice(0, MAX_LABEL_LENGTH);
    if (l) out.add(l);
    if (out.size === MAX_LABELS) break;
  }
  return [...out];
}

function decideScore(
  score: number,
  t: { approveBelow: number; rejectAtOrAbove: number },
): CheckDecision {
  if (score >= t.rejectAtOrAbove) return 'rejected';
  if (score < t.approveBelow) return 'approved';
  return 'needs_review';
}

function describeError(err: unknown): string {
  const message =
    err instanceof ClassifierError
      ? `${err.kind}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Classifies a subject and decides it: `score < approveBelow` is approved, `score >=
 * rejectAtOrAbove` is rejected, anything else is needs_review and opens a `moderation` review
 * item (thresholds from the `trust.thresholds` setting). Any classifier failure is needs_review
 * with reason 'classifier_error'; its returned `score` is 1 so no caller can read it as safe
 * (the stored score is null). Every call stores one `app.trust_checks` row.
 *
 * Throws `bad_request` when the input its kind needs is missing. The classifier call runs
 * before any write, so pass a Db rather than an open transaction when you can.
 */
export async function runCheck(db: DbOrTx, i: RunCheckInput): Promise<CheckResult> {
  const kind = Object.hasOwn(KINDS, i.kind) ? KINDS[i.kind] : undefined;
  if (!kind) throw badRequest(`Unknown check kind: ${String(i.kind)}`);
  const content = buildContent(i);
  const thresholds = (await getSetting(db, 'trust.thresholds'))[i.kind];
  const provider = getEnv().AI_PROVIDER;

  const started = performance.now();
  let output: SafetyOutput | null = null;
  let error: string | null = null;
  try {
    const answer: unknown = await classify({
      model: CLASSIFIER_MODEL,
      system: kind.prompt.system,
      content,
      schema: kind.schema,
      promptVersion: kind.prompt.version,
    });
    // Validate again: whatever classify() returns is not trusted to have the right shape.
    const parsed = kind.schema.safeParse(answer);
    if (!parsed.success) {
      throw new ClassifierError('invalid_output', 'Classifier answer does not match the schema');
    }
    output = parsed.data;
  } catch (err) {
    error = describeError(err);
    logger.warn('trust check failed; sending the subject to review', {
      kind: i.kind,
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      error,
    });
  }
  const latencyMs = Math.max(0, Math.round(performance.now() - started));

  const checkId = newId();
  const decision = output ? decideScore(output.score, thresholds) : 'needs_review';
  const labels = output ? normalizeLabels(output.labels) : [];
  const reason = output
    ? output.reason.trim().slice(0, MAX_REASON_LENGTH) || 'No reason given'
    : CLASSIFIER_ERROR;
  const altText = output?.altText?.trim().slice(0, MAX_ALT_TEXT_LENGTH);

  await transact(db, async (tx) => {
    await tx.insert(trustChecks).values({
      id: checkId,
      kind: i.kind,
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      provider,
      model: CLASSIFIER_MODEL,
      promptVersion: kind.prompt.version,
      score: output ? output.score : null,
      labels,
      reason,
      decision,
      latencyMs,
      error,
    });
    if (decision === 'needs_review') {
      await openReviewItem(tx, {
        queue: 'moderation',
        subjectType: i.subjectType,
        subjectId: i.subjectId,
        reason,
        checkId,
        ...(output ? { aiConfidence: output.score } : {}),
      });
    }
  });

  return {
    checkId,
    decision,
    score: output ? output.score : 1,
    labels,
    reason,
    ...(i.kind === 'image_safety' && i.wantAltText && altText ? { altText } : {}),
  };
}
