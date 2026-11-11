// The email channel: provider adapters (Resend, and a stub that keeps messages in memory) and
// the `notifications.email` job, which sends one notification or one digest of a batch.
//
// The job re-checks everything notify() checked (address, suppression, preference), because
// any of them can change between enqueueing and sending. Each send carries an idempotency key
// (`notif:<id>:email` or `batch:<id>:email`), so a retry after a lost response never sends the
// same email twice.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { render } from '@react-email/components';
import { sql } from 'drizzle-orm';
import { createElement, type ReactElement } from 'react';
import { Resend } from 'resend';
import { z } from 'zod';
import { queryRows, type DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { getUserContact } from '@/modules/identity';
import { getSetting } from '@/modules/settings';
import { isEmailSuppressed, jobKey } from '../notify';
import {
  getType,
  isMandatory,
  notificationUrl,
  type Category,
  type EmailTemplateName,
  type NotificationData,
} from '../types';
import BillingNotice from './templates/BillingNotice';
import Digest, { digestSubject, type DigestItem } from './templates/Digest';
import HostNotice from './templates/HostNotice';
import JobAlertDaily, { jobAlertProps } from './templates/JobAlertDaily';
import JobAlertWeekly from './templates/JobAlertWeekly';
import type { FooterProps } from './templates/Layout';
import ApplicationReceipt from './templates/ApplicationReceipt';
import AvailabilityReconfirm from './templates/AvailabilityReconfirm';
import SeekerNotice from './templates/SeekerNotice';
import OperatorAlert from './templates/OperatorAlert';
import OperatorMention from './templates/OperatorMention';
import SystemTest from './templates/SystemTest';
import TeamInvite from './templates/TeamInvite';
import { manageNotificationsUrl, unsubscribeUrl } from './unsubscribe';

// --- Providers -------------------------------------------------------------------------------

export type Message = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  /** Makes a retried send a no-op at the provider (Resend keeps keys for 24 hours). */
  idempotencyKey?: string;
};

export interface EmailProvider {
  send(m: Message): Promise<{ id: string }>;
}

/** Every message the stub provider "sent", oldest first. Tests read and clear it. */
export const stubOutbox: Message[] = [];

/** Where the stub provider writes messages in local dev, so e2e tests can read them. */
export const STUB_EMAIL_DIR = '.data/emails';

/** Local dev only: never in tests (Vitest), preview or prod. */
function writesToDisk(): boolean {
  return getEnv().APP_ENV === 'dev' && !process.env.VITEST;
}

/**
 * The stub provider keeps messages in `stubOutbox`. In dev outside Vitest it also writes each
 * one to `<dir>/<id>.json` as `{ to, subject, html, text, sentAt }` (the dev server's memory is
 * out of reach of an e2e test).
 */
export function stubEmailProvider(opts: { dir?: string } = {}): EmailProvider {
  const dir = opts.dir ?? STUB_EMAIL_DIR;
  return {
    async send(m) {
      const duplicate =
        m.idempotencyKey !== undefined &&
        stubOutbox.some((sent) => sent.idempotencyKey === m.idempotencyKey);
      const id = `stub_${newId()}`;
      if (duplicate) return { id };
      stubOutbox.push(m);
      if (writesToDisk()) {
        await mkdir(dir, { recursive: true });
        const file = { to: m.to, subject: m.subject, html: m.html, text: m.text };
        await writeFile(
          path.join(dir, `${id}.json`),
          JSON.stringify({ ...file, sentAt: new Date().toISOString() }),
        );
      }
      return { id };
    },
  };
}

export function resendEmailProvider(apiKey: string, from: string): EmailProvider {
  const client = new Resend(apiKey);
  return {
    async send(m) {
      const { data, error } = await client.emails.send(
        { from, to: m.to, subject: m.subject, html: m.html, text: m.text, headers: m.headers },
        m.idempotencyKey ? { idempotencyKey: m.idempotencyKey } : undefined,
      );
      if (error) {
        throw new Error(
          `Resend rejected the email (${error.name}, ${error.statusCode ?? 'no status'}): ${error.message}`,
        );
      }
      if (!data) throw new Error('Resend returned no email id');
      return { id: data.id };
    },
  };
}

let cachedProvider: EmailProvider | undefined;

/** The provider EMAIL_PROVIDER selects (the stub in dev and tests). */
export function getEmailProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;
  const env = getEnv();
  if (env.EMAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY)
      throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    cachedProvider = resendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  } else {
    cachedProvider = stubEmailProvider();
  }
  return cachedProvider;
}

// --- Rendering -------------------------------------------------------------------------------

type Content = { title: string; body: string; url: string | null; data: NotificationData };

/** A notice's button: `data.href` (absolute, or a path on APP_URL), else the notification's url. */
function noticeButton(c: Content): { label: string; href: string } {
  let href = c.url ?? getEnv().APP_URL;
  if (typeof c.data.href === 'string') {
    try {
      const url = new URL(c.data.href, getEnv().APP_URL);
      if (url.protocol === 'https:' || url.protocol === 'http:') href = url.toString();
    } catch {
      // Keep the notification's url.
    }
  }
  const label = typeof c.data.buttonLabel === 'string' ? c.data.buttonLabel : 'Open Explore&Earn';
  return { label, href };
}

function templateElement(name: EmailTemplateName, c: Content, footer: FooterProps): ReactElement {
  switch (name) {
    case 'SystemTest':
      return createElement(SystemTest, { title: c.title, body: c.body, url: c.url, footer });
    case 'OperatorAlert':
      return createElement(OperatorAlert, {
        title: c.title,
        body: c.body,
        url: c.url,
        severity: c.data.severity === 'critical' ? 'critical' : 'warning',
        footer,
      });
    case 'OperatorMention':
      return createElement(OperatorMention, { title: c.title, body: c.body, url: c.url, footer });
    case 'Digest':
      return createElement(Digest, {
        items: [{ title: c.title, body: c.body, url: c.url }],
        url: c.url,
        footer,
      });
    case 'HostNotice':
    case 'BillingNotice':
      return createElement(name === 'HostNotice' ? HostNotice : BillingNotice, {
        heading: c.title,
        lines: c.body.split('\n').filter((line) => line.trim() !== ''),
        button: noticeButton(c),
        footer,
      });
    case 'TeamInvite':
      return createElement(TeamInvite, {
        orgName: String(c.data.orgName ?? ''),
        inviterName: String(c.data.inviterName ?? ''),
        role: String(c.data.role ?? ''),
        acceptUrl: noticeButton(c).href,
        expiresAt: String(c.data.expiresAt ?? ''),
        footer,
      });
    // SP3: the saved searches' jobs come from `data` (discovery's JobAlertEmailData).
    case 'JobAlertDaily':
      return createElement(JobAlertDaily, {
        ...jobAlertProps(c.data),
        title: c.title,
        body: c.body,
        footer,
      });
    case 'JobAlertWeekly':
      return createElement(JobAlertWeekly, {
        ...jobAlertProps(c.data),
        title: c.title,
        body: c.body,
        footer,
      });
    // SP4. Notification data holds ids, `listingTitle`, `orgName` and `firstName` only.
    case 'ApplicationReceipt':
      return createElement(ApplicationReceipt, {
        firstName: typeof c.data.firstName === 'string' ? c.data.firstName : '',
        listingTitle: typeof c.data.listingTitle === 'string' ? c.data.listingTitle : '',
        orgName: typeof c.data.orgName === 'string' ? c.data.orgName : '',
        submittedAt: typeof c.data.submittedAt === 'string' ? c.data.submittedAt : null,
        receiptUrl: c.url,
        footer,
      });
    case 'AvailabilityReconfirm':
      return createElement(AvailabilityReconfirm, {
        title: c.title,
        body: c.body,
        url: c.url,
        footer,
      });
    case 'SeekerNotice':
      return createElement(SeekerNotice, {
        heading: c.title,
        lines: c.body.split('\n').filter((line) => line.trim() !== ''),
        button: noticeButton(c),
        footer,
      });
  }
}

/** Plain-text headings keep their case (html-to-text uppercases them by default). */
const PLAIN_TEXT_OPTIONS = {
  plainText: true,
  htmlToTextOptions: {
    selectors: ['h1', 'h2', 'h3'].map((selector) => ({
      selector,
      options: { uppercase: false },
    })),
  },
} as const;

export async function renderEmail(el: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(el), render(el, PLAIN_TEXT_OPTIONS)]);
  return { html, text };
}

async function footerFor(db: DbOrTx, userId: string, category: Category): Promise<FooterProps> {
  return {
    mailingAddress: (await getSetting(db, 'business.mailing_address')).trim(),
    manageUrl: manageNotificationsUrl(),
    unsubscribeUrl: unsubscribeUrl(userId, category),
  };
}

/** RFC 8058 one-click unsubscribe, on every email. */
function unsubscribeHeaders(footer: FooterProps): Record<string, string> {
  return {
    'List-Unsubscribe': `<${footer.unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

// --- The job ---------------------------------------------------------------------------------

const payloadSchema = z.union([
  z.object({ notificationId: z.uuid() }),
  z.object({ batchId: z.uuid() }),
]);

export type EmailJobPayload = z.infer<typeof payloadSchema>;

type Recipient = { email: string | null; deleted: boolean; suppressed: boolean };

function canEmail(r: Recipient): r is Recipient & { email: string } {
  return r.email !== null && r.email.trim() !== '' && !r.deleted && !r.suppressed;
}

/** The user's address (from identity, which owns app.users) and whether it may be emailed. */
async function recipientOf(db: DbOrTx, userId: string): Promise<Recipient> {
  const user = await getUserContact(db, userId);
  const email = user?.email ?? null;
  return {
    email,
    deleted: !user || user.deleted,
    suppressed: email ? await isEmailSuppressed(db, email) : false,
  };
}

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  category: Category;
  title: string;
  body: string;
  data: string;
  email_enabled: boolean;
};

async function sendOne(
  db: DbOrTx,
  notificationId: string,
  provider: EmailProvider,
): Promise<'sent' | 'skipped'> {
  const [n] = await queryRows<NotificationRow>(
    db,
    sql`
      select n.id, n.user_id, n.type, n.category, n.title, n.body, n.data::text as data,
        coalesce((
          select enabled from app.notification_preferences p
          where p.user_id = n.user_id and p.category = n.category and p.channel = 'email'
        ), true) as email_enabled
      from app.notifications n
      where n.id = ${notificationId}
    `,
  );
  if (!n) {
    logger.warn('notifications.email: notification not found', { notificationId });
    return 'skipped';
  }
  const def = getType(n.type);
  if (!def?.email) {
    logger.warn('notifications.email: type has no email', { notificationId, type: n.type });
    return 'skipped';
  }
  if (!(isMandatory(def) || n.email_enabled)) return 'skipped';
  const to = await recipientOf(db, n.user_id);
  if (!canEmail(to)) return 'skipped';

  const data = JSON.parse(n.data) as NotificationData;
  const footer = await footerFor(db, n.user_id, n.category);
  const el = templateElement(
    def.email.template,
    { title: n.title, body: n.body, url: notificationUrl(n.type, data), data },
    footer,
  );
  const { html, text } = await renderEmail(el);
  await provider.send({
    to: to.email,
    subject: n.title,
    html,
    text,
    headers: unsubscribeHeaders(footer),
    idempotencyKey: jobKey(n.id, 'email'),
  });
  return 'sent';
}

async function sendDigest(
  db: DbOrTx,
  batchId: string,
  provider: EmailProvider,
): Promise<'sent' | 'skipped'> {
  const [b] = await queryRows<{ id: string; user_id: string }>(
    db,
    sql`select b.id, b.user_id from app.notification_batches b where b.id = ${batchId}`,
  );
  if (!b) {
    logger.warn('notifications.email: batch not found', { batchId });
    return 'skipped';
  }
  const to = await recipientOf(db, b.user_id);
  if (!canEmail(to)) return 'skipped';

  // Only what is still unread, and only categories whose email is still on.
  const rows = await queryRows<Omit<NotificationRow, 'user_id'>>(
    db,
    sql`
      select n.id, n.type, n.category, n.title, n.body, n.data::text as data,
        coalesce((
          select enabled from app.notification_preferences p
          where p.user_id = n.user_id and p.category = n.category and p.channel = 'email'
        ), true) as email_enabled
      from app.notifications n
      where n.user_id = ${b.user_id}
        and n.read_at is null
        and n.id in (
          select unnest(notification_ids) from app.notification_batches where id = ${batchId}
        )
      order by n.id
    `,
  );
  const kept = rows.filter((r) => {
    const def = getType(r.type);
    return (def !== undefined && isMandatory(def)) || r.email_enabled;
  });
  const [first] = kept;
  if (!first) return 'skipped';

  const items: DigestItem[] = kept.map((r) => ({
    title: r.title,
    body: r.body,
    url: notificationUrl(r.type, JSON.parse(r.data) as NotificationData),
  }));
  const footer = await footerFor(db, b.user_id, first.category);
  const { html, text } = await renderEmail(
    createElement(Digest, { items, url: manageNotificationsUrl(), footer }),
  );
  await provider.send({
    to: to.email,
    subject: digestSubject(items),
    html,
    text,
    headers: unsubscribeHeaders(footer),
    idempotencyKey: `batch:${b.id}:email`,
  });
  return 'sent';
}

/**
 * Handles a `notifications.email` job: `{ notificationId }` sends that notification with its
 * type's template; `{ batchId }` sends one Digest of the batch's still-unread notifications.
 * Returns 'skipped' when there is nothing (left) to send. Throws on an unreadable payload or a
 * provider error, so the outbox retries.
 */
export async function sendEmailJob(
  db: DbOrTx,
  payload: unknown,
  deps: { provider?: EmailProvider } = {},
): Promise<'sent' | 'skipped'> {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error('notifications.email: invalid payload');
  const provider = deps.provider ?? getEmailProvider();
  return 'notificationId' in parsed.data
    ? sendOne(db, parsed.data.notificationId, provider)
    : sendDigest(db, parsed.data.batchId, provider);
}
