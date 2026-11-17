// Direct emails: one-off transactional messages to an address rather than to a user (SP2 Plan
// decision 9), such as team invitations to people without an account. They honor
// `email_suppressions` but carry no List-Unsubscribe header and no notification row.
//
// - sendEmailTo enqueues `notifications.email_direct`. Its payload (the template data) stays in
//   app.outbox after sending, so the data must never hold a secret.
// - sendEmailNow renders and sends at once and stores nothing. Call it from a job handler: a
//   provider failure throws so the job retries. Invitation links (tokens) go this way.
import { createElement, type ReactElement } from 'react';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { enqueue } from '@/modules/jobs';
import { getSetting } from '@/modules/settings';
import { isEmailSuppressed } from '../notify';
import { CATEGORIES, EMAIL_TEMPLATE_NAMES, type Category, type EmailTemplateName } from '../types';
import { getEmailProvider, renderEmail, type EmailProvider } from './send';
import BillingNotice from './templates/BillingNotice';
import HostNotice from './templates/HostNotice';
import type { DirectFooterProps } from './templates/Layout';
import TeamInvite, { teamInviteSubject } from './templates/TeamInvite';

export const EMAIL_DIRECT_TOPIC = 'notifications.email_direct';

export type DirectEmailInput = {
  to: string;
  template: EmailTemplateName;
  data: Record<string, unknown>;
  category: Category;
};

const httpUrl = z.url({ protocol: /^https?$/ });
const notice = z.object({
  heading: z.string().min(1),
  lines: z.array(z.string()),
  button: z.object({ label: z.string().min(1), href: httpUrl }),
});

/**
 * Each template's props as a direct email's `data`, and how its subject reads. Only the SP2
 * templates go out directly; Foundation's are for notifications to users.
 */
function directEmail(
  template: EmailTemplateName,
  data: unknown,
  footer: DirectFooterProps,
): { subject: string; element: ReactElement } {
  const parse = <T>(schema: z.ZodType<T>): T => {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw badRequest(`Invalid data for the ${template} email`, parsed.error.issues);
    }
    return parsed.data;
  };
  switch (template) {
    case 'SystemTest':
    case 'OperatorMention':
    case 'OperatorAlert':
    case 'Digest':
    case 'JobAlertDaily':
    case 'JobAlertWeekly':
    case 'ApplicationReceipt':
    case 'AvailabilityReconfirm':
    case 'SeekerNotice':
      throw badRequest(`The ${template} email can't be sent as a direct email`);
    case 'HostNotice': {
      const d = parse(notice);
      return { subject: d.heading, element: createElement(HostNotice, { ...d, footer }) };
    }
    case 'BillingNotice': {
      const d = parse(notice);
      return { subject: d.heading, element: createElement(BillingNotice, { ...d, footer }) };
    }
    case 'TeamInvite': {
      const d = parse(
        z.object({
          orgName: z.string().min(1),
          inviterName: z.string().min(1),
          role: z.string().min(1),
          acceptUrl: httpUrl,
          expiresAt: z.string().min(1),
        }),
      );
      return {
        subject: teamInviteSubject(d.orgName),
        element: createElement(TeamInvite, { ...d, footer }),
      };
    }
  }
}

function normalizeAddress(to: string): string {
  const address = to.trim().toLowerCase();
  if (!z.email().safeParse(address).success) throw badRequest('Invalid email address');
  return address;
}

async function render(db: DbOrTx, i: DirectEmailInput) {
  const footer = { mailingAddress: (await getSetting(db, 'business.mailing_address')).trim() };
  const { subject, element } = directEmail(i.template, i.data, footer);
  return { subject, ...(await renderEmail(element)) };
}

/**
 * Queues one direct email (`notifications.email_direct`) unless the address is suppressed.
 * `dedupeKey` makes repeated calls queue it once. Throws `bad_request` for an invalid address
 * or data that doesn't fit the template.
 */
export async function sendEmailTo(
  db: DbOrTx,
  i: DirectEmailInput & { dedupeKey?: string },
): Promise<void> {
  const to = normalizeAddress(i.to);
  directEmail(i.template, i.data, { mailingAddress: '' });
  if (await isEmailSuppressed(db, to)) return;
  await enqueue(db, {
    topic: EMAIL_DIRECT_TOPIC,
    payload: { messageId: newId(), to, template: i.template, data: i.data, category: i.category },
    ...(i.dedupeKey ? { dedupeKey: `email_direct:${i.dedupeKey}` } : {}),
  });
}

/**
 * Renders and sends one direct email now, storing nothing (no outbox or notification row, and
 * `data` is never logged). Returns 'suppressed' without sending to a suppressed address.
 */
export async function sendEmailNow(
  db: DbOrTx,
  i: DirectEmailInput,
  deps: { provider?: EmailProvider } = {},
): Promise<'sent' | 'suppressed'> {
  const to = normalizeAddress(i.to);
  if (await isEmailSuppressed(db, to)) return 'suppressed';
  const { subject, html, text } = await render(db, i);
  await (deps.provider ?? getEmailProvider()).send({ to, subject, html, text, headers: {} });
  return 'sent';
}

const jobPayload = z.object({
  messageId: z.uuid(),
  to: z.string(),
  template: z.enum(EMAIL_TEMPLATE_NAMES),
  data: z.record(z.string(), z.unknown()),
  category: z.enum(CATEGORIES),
});

/**
 * Handles `notifications.email_direct`: re-checks suppression, renders and sends, with the
 * idempotency key `direct:<messageId>` so a retry never sends twice.
 */
export async function sendEmailDirectJob(
  db: DbOrTx,
  payload: unknown,
  deps: { provider?: EmailProvider } = {},
): Promise<'sent' | 'skipped'> {
  const parsed = jobPayload.safeParse(payload);
  if (!parsed.success) throw new Error('notifications.email_direct: invalid payload');
  const p = parsed.data;
  if (await isEmailSuppressed(db, p.to)) return 'skipped';
  const { subject, html, text } = await render(db, p);
  await (deps.provider ?? getEmailProvider()).send({
    to: p.to,
    subject,
    html,
    text,
    headers: {},
    idempotencyKey: `direct:${p.messageId}`,
  });
  return 'sent';
}
