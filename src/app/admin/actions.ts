'use server';
// The operator console's server actions. Each one is a public POST endpoint, so each checks the
// session itself, before anything else, with requireOperator:
// - an action on a review item passes the item's queue (`requireOperator({ queue })`);
// - a ban or a refund, a settings change and an operator invitation also need Clerk
//   reverification (`sensitive: true`), which the client's useReverification handles: the
//   action returns Clerk's reverification hint, the user confirms it is them, and the action
//   runs again.
// The domain rules (who may claim, decide, sign off...) are the trust and operator modules'.
import { reverificationError } from '@clerk/nextjs/server';
import { refresh } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { isAppError, notFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { clerkAdmin } from '@/modules/identity';
import {
  createTestItem,
  inviteOperator,
  reviewActionInfo,
  reviewItemQueue,
  setOperatorQueues,
  setShiftStatus,
} from '@/modules/operator';
import { SETTING_KEYS, setSetting, type SettingKey, type SettingValue } from '@/modules/settings';
import {
  addNote,
  approveSecond,
  claim,
  decide,
  escalate,
  handOff,
  QUEUES,
  REVIEW_ACTIONS,
  rejectSecond,
  type Queue,
} from '@/modules/trust';
import {
  requireOperator,
  SENSITIVE_REVERIFICATION,
  type GuardDenial,
  type OperatorContext,
} from '@/server/guards';

export type ActionResult =
  { ok: true; message?: string; href?: string } | { ok: false; error: string };

type ReverificationHint = ReturnType<typeof reverificationError>;

/** What a console action returns: its result, or Clerk's hint that the user must reverify. */
export type ActionOutcome = ActionResult | ReverificationHint;

class InputError extends Error {}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InputError(parsed.error.issues[0]?.message ?? 'Invalid input');
  return parsed.data;
}

function failure(err: unknown, action: string): ActionOutcome {
  if (err instanceof InputError) return { ok: false, error: err.message };
  if (isAppError(err)) {
    const denial = err.details as Partial<GuardDenial> | undefined;
    if (denial?.reason === 'reverification_required') {
      return reverificationError(SENSITIVE_REVERIFICATION);
    }
    if (err.code === 'unauthorized') return { ok: false, error: 'Sign in again to continue.' };
    return { ok: false, error: err.message };
  }
  logger.error('console action failed', {
    action,
    error: err instanceof Error ? err.message : String(err),
  });
  return { ok: false, error: 'Something went wrong. Try again.' };
}

/**
 * Runs `work` for the operator `guard` returns, then refreshes the page. Any error becomes a
 * message for the screen (or the reverification hint); unknown errors are logged, not shown.
 */
async function perform(
  action: string,
  guard: () => Promise<OperatorContext>,
  work: (op: OperatorContext) => Promise<{ message?: string; href?: string }>,
): Promise<ActionOutcome> {
  try {
    const op = await guard();
    const result = await work(op);
    refresh();
    return { ok: true, ...result };
  } catch (err) {
    return failure(err, action);
  }
}

const uuid = z.uuid('Unknown id');

/** The operator for an action on one review item: they must cover its queue. */
async function itemOperator(itemId: string, o: { sensitive?: boolean } = {}) {
  const queue = await reviewItemQueue(getDb(), itemId);
  const op = await requireOperator({ ...(queue ? { queue } : {}), sensitive: o.sensitive });
  if (!queue) throw notFound('Review item not found');
  return op;
}

// --- Review items -----------------------------------------------------------------------------

export async function claimItem(itemId: string): Promise<ActionOutcome> {
  return perform(
    'claim',
    () => itemOperator(parse(uuid, itemId)),
    async (op) => {
      await claim(getDb(), itemId, op.user.id);
      return { message: 'Claimed' };
    },
  );
}

const noteSchema = z
  .string()
  .trim()
  .min(1, 'Write a note first')
  .max(5000, 'A note must be at most 5,000 characters');

export async function addItemNote(itemId: string, body: string): Promise<ActionOutcome> {
  return perform(
    'add_note',
    () => itemOperator(parse(uuid, itemId)),
    async (op) => {
      await addNote(getDb(), itemId, op.user.id, parse(noteSchema, body));
      return { message: 'Note added' };
    },
  );
}

const decisionSchema = z.object({
  action: z.enum(REVIEW_ACTIONS),
  amountCents: z.number().int().positive('Enter an amount above zero').optional(),
});

export async function decideItem(
  itemId: string,
  input: { action: string; amountCents?: number },
): Promise<ActionOutcome> {
  return perform(
    'decide',
    async () => {
      const d = parse(decisionSchema, input);
      return itemOperator(parse(uuid, itemId), {
        sensitive: d.action === 'ban' || d.action === 'refund',
      });
    },
    async (op) => {
      const d = parse(decisionSchema, input);
      if (d.action === 'refund' && d.amountCents === undefined) {
        throw new InputError('Enter the refund amount');
      }
      const { status } = await decide(getDb(), itemId, op.user.id, d.action, {
        ...(d.amountCents !== undefined ? { amountCents: d.amountCents } : {}),
      });
      return {
        message: status === 'pending_second' ? 'Waiting for a second operator' : 'Decision applied',
      };
    },
  );
}

const escalateSchema = z.object({
  toOperatorId: uuid.optional(),
  reason: z
    .string()
    .trim()
    .min(1, 'Give a reason for escalating')
    .max(2000, 'A reason must be at most 2,000 characters'),
});

export async function escalateItem(
  itemId: string,
  input: { toOperatorId?: string; reason: string },
): Promise<ActionOutcome> {
  return perform(
    'escalate',
    () => itemOperator(parse(uuid, itemId)),
    async (op) => {
      const e = parse(escalateSchema, input);
      await escalate(getDb(), itemId, op.user.id, {
        reason: e.reason,
        ...(e.toOperatorId ? { toOperatorId: e.toOperatorId } : {}),
      });
      return { message: 'Escalated' };
    },
  );
}

export async function handOffItem(itemId: string, toOperatorId: string): Promise<ActionOutcome> {
  return perform(
    'hand_off',
    () => itemOperator(parse(uuid, itemId)),
    async (op) => {
      await handOff(getDb(), itemId, op.user.id, parse(uuid, toOperatorId));
      return { message: 'Handed off' };
    },
  );
}

/**
 * The second sign-off on a held ban or refund. Any operator other than its author may give it,
 * whatever queues they cover (trust.approveSecond), so the guard checks no queue; applying a
 * ban or refund is sensitive, so it needs reverification.
 */
export async function approveSecondSignOff(actionId: string): Promise<ActionOutcome> {
  return perform(
    'approve_second',
    async () => {
      const op = await requireOperator({ sensitive: true });
      if (!(await reviewActionInfo(getDb(), parse(uuid, actionId)))) {
        throw notFound('Decision not found');
      }
      return op;
    },
    async (op) => {
      await approveSecond(getDb(), actionId, op.user.id);
      return { message: 'Signed off and applied' };
    },
  );
}

/** Turns down (or, by its author, withdraws) a decision waiting for a second sign-off. */
export async function rejectSecondSignOff(actionId: string): Promise<ActionOutcome> {
  return perform(
    'reject_second',
    async () => {
      const op = await requireOperator();
      if (!(await reviewActionInfo(getDb(), parse(uuid, actionId)))) {
        throw notFound('Decision not found');
      }
      return op;
    },
    async (op) => {
      await rejectSecond(getDb(), actionId, op.user.id);
      return { message: 'Decision turned down' };
    },
  );
}

/** Dev and preview only: a `__flag__` text item through the real text check. */
export async function createTestReviewItem(): Promise<ActionOutcome> {
  return perform(
    'create_test_item',
    () => requireOperator({ queue: 'moderation' }),
    async (op) => {
      if (getEnv().APP_ENV === 'prod') throw notFound('Test items are not available in production');
      const item = await createTestItem(getDb(), op.user.id);
      return item.itemId
        ? { message: 'Test item created', href: `/queues/${item.itemId}` }
        : { message: `Test item ${item.decision} by the check` };
    },
  );
}

// --- Operators --------------------------------------------------------------------------------

const shiftSchema = z.enum(['on_shift', 'away']);

/** Operators set their own shift; an Owner may set anyone's (operator.setShiftStatus). */
export async function setOperatorShift(userId: string, status: string): Promise<ActionOutcome> {
  return perform(
    'set_shift',
    () => requireOperator(),
    async (op) => {
      const next = parse(shiftSchema, status);
      await setShiftStatus(getDb(), op.user.id, parse(uuid, userId), next);
      return { message: next === 'on_shift' ? 'On shift' : 'Away' };
    },
  );
}

const queuesSchema = z.array(z.enum(QUEUES)).max(QUEUES.length);

/** Owner only (operator.setOperatorQueues). */
export async function setQueuesForOperator(
  userId: string,
  queues: string[],
): Promise<ActionOutcome> {
  return perform(
    'set_queues',
    () => requireOperator(),
    async (op) => {
      const next: Queue[] = parse(queuesSchema, queues);
      await setOperatorQueues(getDb(), op.user.id, parse(uuid, userId), next);
      return { message: 'Queues saved' };
    },
  );
}

const inviteSchema = z.object({
  email: z.email('Enter a valid email address').max(254),
  role: z.enum(['owner', 'operator']),
});

/** Owner only. Emails a Clerk invitation (operator.inviteOperator). */
export async function inviteConsoleOperator(input: {
  email: string;
  role: string;
}): Promise<ActionOutcome> {
  return perform(
    'invite_operator',
    () => requireOperator({ sensitive: true }),
    async (op) => {
      const i = parse(inviteSchema, { email: input.email.trim(), role: input.role });
      const { email } = await inviteOperator(getDb(), clerkAdmin(), op.user.id, i);
      return { message: `Invitation sent to ${email}` };
    },
  );
}

// --- Settings ---------------------------------------------------------------------------------

/** Owner only. The value is validated by the setting's own schema (settings.setSetting). */
export async function updateSetting(key: string, value: unknown): Promise<ActionOutcome> {
  return perform(
    'update_setting',
    () => requireOperator({ sensitive: true }),
    async (op) => {
      if (op.role !== 'owner') throw new InputError('Only an Owner can change settings');
      if (!(SETTING_KEYS as readonly string[]).includes(key)) {
        throw new InputError('Unknown setting');
      }
      const k = key as SettingKey;
      await setSetting(getDb(), k, value as SettingValue<typeof k>, { operatorId: op.user.id });
      return { message: 'Saved' };
    },
  );
}
