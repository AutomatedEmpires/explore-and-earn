// trust.runCheck: classify a subject with Claude, apply the operator-set thresholds, store the
// result, and send anything uncertain to the moderation queue.
//
// Fail closed (Review Focus 5): if the classifier errors, times out, or answers in the wrong
// shape, the decision is needs_review with reason 'classifier_error'. Nothing is ever approved
// without a valid classifier answer.
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CLASSIFIER_MODEL, ClassifierError, classify, type ClassifyContent } from '@/lib/ai';
import type { DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { badRequest } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { SETTING_DEFAULTS, getSetting, type Thresholds } from '@/modules/settings';
import { transact } from './internal';
import * as businessVerificationPrompt from './prompts/business_verification';
import * as imageSafetyPrompt from './prompts/image_safety';
import * as listingFraudPrompt from './prompts/listing_fraud';
import * as listingModerationPrompt from './prompts/listing_moderation';
import * as photoSlotPrompt from './prompts/photo_slot';
import * as textSafetyPrompt from './prompts/text_safety';
import { openReviewItem } from './routing';
import { trustChecks } from './schema';
import type { CheckDecision, CheckKind, CheckResult, RunCheckInput } from './types';

/** The reason stored (and returned) when the classifier gave no usable answer. */
export const CLASSIFIER_ERROR = 'classifier_error';

/** What every kind's classifier answers. An image kind may add alt text. */
export type CheckOutput = { score: number; labels: string[]; reason: string; altText?: string };

export type CheckKindDef = {
  kind: string;
  /** What the classifier reads: `text` (required), or an `image` (with optional text). */
  input: 'text' | 'image';
  /** Bump `version` whenever `system` changes: every stored check records it. */
  prompt: { version: string; system: string };
  /** The classifier's answer, validated before anything is decided. */
  schema: z.ZodType<CheckOutput>;
  /** Used until an operator tunes this kind in the `trust.thresholds` setting. */
  defaultThresholds: Thresholds;
};

const KIND_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const kinds = new Map<string, CheckKindDef>();

/**
 * Registers (or replaces) a check kind, so later sub-projects add theirs (listing, message
 * scam, business verification) without editing trust. An operator's thresholds for other kinds
 * are untouched: `trust.thresholds` is keyed by kind, and a kind it has no entry for uses
 * `defaultThresholds`.
 */
export function registerCheckKind(def: CheckKindDef): void {
  if (!KIND_NAME.test(def.kind)) {
    throw new Error(`registerCheckKind: "${def.kind}" is not a lowercase kind name`);
  }
  const t = def.defaultThresholds;
  // rejectAtOrAbove may be 1.01, above any score, so a kind is never auto-rejected.
  if (!(t.approveBelow >= 0 && t.approveBelow <= t.rejectAtOrAbove && t.rejectAtOrAbove <= 1.01)) {
    throw new Error(`registerCheckKind: ${def.kind} has invalid default thresholds`);
  }
  if (!def.prompt.version || !def.prompt.system) {
    throw new Error(`registerCheckKind: ${def.kind} needs a prompt version and system prompt`);
  }
  kinds.set(def.kind, def);
}

const safety = z.object({
  score: z.number().min(0).max(1),
  labels: z.array(z.string()),
  reason: z.string(),
});

const FOUNDATION_THRESHOLDS: Thresholds = { approveBelow: 0.2, rejectAtOrAbove: 0.9 };

registerCheckKind({
  kind: 'text_safety',
  input: 'text',
  prompt: textSafetyPrompt,
  schema: safety,
  defaultThresholds: FOUNDATION_THRESHOLDS,
});
registerCheckKind({
  kind: 'image_safety',
  input: 'image',
  prompt: imageSafetyPrompt,
  schema: safety.extend({ altText: z.string() }),
  defaultThresholds: FOUNDATION_THRESHOLDS,
});

// SP2's kinds. Their default thresholds are the trust.thresholds defaults, so the operator
// console shows them; text kinds classify `text`, image kinds classify `image` with `text` as
// its caption or label.
const SP2_THRESHOLDS = SETTING_DEFAULTS['trust.thresholds'];

function sp2Thresholds(kind: string): Thresholds {
  const t = SP2_THRESHOLDS[kind];
  if (!t) throw new Error(`trust.thresholds has no default for ${kind}`);
  return t;
}

registerCheckKind({
  kind: 'listing_moderation',
  input: 'text',
  prompt: listingModerationPrompt,
  schema: safety,
  defaultThresholds: sp2Thresholds('listing_moderation'),
});
registerCheckKind({
  kind: 'listing_fraud',
  input: 'text',
  prompt: listingFraudPrompt,
  schema: safety,
  defaultThresholds: sp2Thresholds('listing_fraud'),
});
registerCheckKind({
  kind: 'business_verification',
  input: 'text',
  prompt: businessVerificationPrompt,
  schema: safety,
  // Never auto-rejected: rejectAtOrAbove is 1.01 (SP2 spec section 8.4).
  defaultThresholds: sp2Thresholds('business_verification'),
});
registerCheckKind({
  kind: 'photo_slot',
  input: 'image',
  // The 640 px photo and its slot label; the score is the probability of a mismatch.
  prompt: photoSlotPrompt,
  schema: safety,
  defaultThresholds: sp2Thresholds('photo_slot'),
});

/**
 * The registered kind, or undefined. A module registers its kinds when its index is imported,
 * and only that module runs checks of them (it supplies their input), so a kind is always
 * registered by the time it is checked.
 */
function findKind(kind: string): CheckKindDef | undefined {
  return kinds.get(kind);
}

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

function buildContent(def: CheckKindDef, i: RunCheckInput): ClassifyContent[] {
  const text = i.text?.trim() ? i.text : undefined;
  if (def.input === 'text') {
    if (!text) throw badRequest(`${def.kind} needs non-empty text`);
    return [{ type: 'text', text: wrapSubmittedText(text) }];
  }
  if (!i.image || i.image.bytes.length === 0) throw badRequest(`${def.kind} needs an image`);
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
 * rejectAtOrAbove` is rejected, anything else is needs_review and opens a review item in
 * `reviewQueue` (default `moderation`; `null` opens none). Thresholds come from the
 * `trust.thresholds` setting, or the kind's registered default when that has no entry for it.
 * Any classifier failure is needs_review with reason 'classifier_error'; its returned `score` is
 * 1 so no caller can read it as safe (the stored score is null). Every call stores one
 * `app.trust_checks` row.
 *
 * Throws `bad_request` for an unregistered kind or when the input its kind needs is missing.
 * The classifier call runs before any write, so pass a Db rather than an open transaction when
 * you can.
 */
export async function runCheck(db: DbOrTx, i: RunCheckInput): Promise<CheckResult> {
  const kind = findKind(i.kind);
  if (!kind) throw badRequest(`Unknown check kind: ${String(i.kind)}`);
  const content = buildContent(kind, i);
  const reviewQueue = i.reviewQueue === undefined ? 'moderation' : i.reviewQueue;
  const tuned = await getSetting(db, 'trust.thresholds');
  const thresholds = Object.hasOwn(tuned, i.kind)
    ? (tuned[i.kind] ?? kind.defaultThresholds)
    : kind.defaultThresholds;
  const provider = getEnv().AI_PROVIDER;

  const started = performance.now();
  let output: CheckOutput | null = null;
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
  const wrote = output?.altText?.trim().slice(0, MAX_ALT_TEXT_LENGTH);
  const altText = kind.input === 'image' && i.wantAltText && wrote ? wrote : undefined;

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
      altText: altText ?? null,
    });
    if (decision === 'needs_review' && reviewQueue !== null) {
      await openReviewItem(tx, {
        queue: reviewQueue,
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
    ...(altText ? { altText } : {}),
  };
}

/**
 * The newest stored check of `kind` for a subject, as runCheck returned it (a failed one has
 * score 1), or null. A caller that must classify a subject once (a retried media scan) reads
 * this first, so a retry reuses the earlier result and the review item it opened instead of
 * storing a second check and opening a second item.
 */
export async function findLatestCheck(
  db: DbOrTx,
  i: { kind: CheckKind; subjectType: string; subjectId: string },
): Promise<CheckResult | null> {
  const [row] = await db
    .select()
    .from(trustChecks)
    .where(
      and(
        eq(trustChecks.kind, i.kind),
        eq(trustChecks.subjectType, i.subjectType),
        eq(trustChecks.subjectId, i.subjectId),
      ),
    )
    .orderBy(desc(trustChecks.createdAt), desc(trustChecks.id))
    .limit(1);
  if (!row) return null;
  return {
    checkId: row.id,
    decision: row.decision,
    score: row.score ?? 1,
    labels: row.labels,
    reason: row.reason,
    ...(row.altText ? { altText: row.altText } : {}),
  };
}
