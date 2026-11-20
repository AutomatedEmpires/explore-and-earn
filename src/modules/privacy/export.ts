// Data export (SP8 spec 8.1). One outbox step per module writes that module's part to the
// private `privacy-exports` bucket; the finalize step zips the parts, deletes them and tells the
// person. A download is a fresh 300-second signed URL each time, and stops after the TTL.
//
// An export can be running when the person deletes their account. A step and the finalize
// step therefore lock the request row from their status check to their last write, and the
// privacy eraser takes the same lock before it stops the request and removes its files. So a
// write either lands before the eraser cleans up, or never happens.
//
// Export contents are personal data. They are written to storage and nowhere else: never to a
// log, an audit row, an outbox payload or an error message.
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Tx } from '@/lib/db';
import { conflict, gone, notFound, rateLimited } from '@/lib/errors';
import { getEnv } from '@/lib/env';
import { newId } from '@/lib/ids';
import { safeErrorMessage } from '@/lib/scrub';
import { record } from '@/modules/audit';
import { findUserById } from '@/modules/identity';
import { enqueue } from '@/modules/jobs';
import { getStorage, ObjectNotFoundError, readMediaForExport, type Storage } from '@/modules/media';
import { notify } from '@/modules/notifications';
import { consume } from '@/modules/ratelimit';
import { getSetting } from '@/modules/settings';
import type { PrivacyRegistry } from '@/server/privacy-registry';
import {
  clipError,
  EXPORT_FINALIZE_TOPIC,
  EXPORT_STEP_TOPIC,
  findOpenRequest,
  isUniqueViolation,
  loadRequest,
  loadStep,
  OPEN_STATUSES,
  privacySettingsUrl,
  requireRequester,
  resolveRegistry,
  subjectOf,
  UUID,
  type RequestRow,
} from './requests';
import { privacyRequestSteps, privacyRequests } from './schema';
import { buildZip, textBytes } from './zip';

const BUCKET = 'privacy-exports';
const EXPORTS_PER_WINDOW = 3;
const EXPORT_WINDOW_SEC = 30 * 24 * 60 * 60;
const DOWNLOAD_URL_TTL_SEC = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ExportDeps = { storage?: Storage; registry?: PrivacyRegistry; now?: Date };

/** What a module's export step leaves in storage for the finalize step. */
type StoredPart = {
  records: Record<string, unknown[]>;
  /** Archive paths (`files/<module>/<name>`) of files that could not be copied. */
  missingFiles: string[];
  /** Names of the files copied to `<requestId>/parts/files/<module>/`. */
  files: string[];
};

const storedPart = z.object({
  records: z.record(z.string(), z.array(z.unknown())),
  missingFiles: z.array(z.string()),
  files: z.array(z.string()),
});

const partPath = (requestId: string, module: string) => `${requestId}/parts/${module}.json`;
const partFilePath = (requestId: string, module: string, name: string) =>
  `${requestId}/parts/files/${module}/${name}`;
const zipPath = (requestId: string) => `${requestId}.zip`;

/** A handler's file name, reduced to one safe path segment. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._-]+/, '');
  return cleaned === '' ? 'file' : cleaned;
}

async function readOrNull(storage: Storage, path: string): Promise<Uint8Array | null> {
  try {
    return await storage.read(BUCKET, path);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return null;
    throw err;
  }
}

async function readPart(
  storage: Storage,
  requestId: string,
  module: string,
): Promise<StoredPart | null> {
  const bytes = await readOrNull(storage, partPath(requestId, module));
  if (!bytes) return null;
  return storedPart.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

/**
 * Deletes the parts of a request and the files copied for them: everything under
 * `<requestId>/`. It lists storage instead of reading the part files, so a file a step copied
 * before it wrote its part is found too. Safe to repeat.
 */
export async function removeExportParts(storage: Storage, requestId: string): Promise<void> {
  for (const path of await storage.listUnder(BUCKET, requestId)) {
    await storage.remove(BUCKET, path);
  }
}

/** Deletes everything a request ever wrote: its parts and its archive. Safe to repeat. */
export async function removeExportFiles(storage: Storage, requestId: string): Promise<void> {
  await removeExportParts(storage, requestId);
  await storage.remove(BUCKET, zipPath(requestId));
}

const isOpen = (status: RequestRow['status']) =>
  (OPEN_STATUSES as readonly string[]).includes(status);

/** The request, with its row locked until the transaction ends (see the header). */
async function lockRequest(tx: Tx, requestId: string): Promise<RequestRow | null> {
  if (!UUID.test(requestId)) return null;
  const [row] = await tx
    .select()
    .from(privacyRequests)
    .where(eq(privacyRequests.id, requestId))
    .for('update');
  return row ?? null;
}

/**
 * Starts an export of everything the registry's modules hold about the user. One open export
 * at a time, three in 30 days. Call `kickWorker()` after it returns.
 */
export async function requestExport(
  db: Db,
  userId: string,
  deps: ExportDeps = {},
): Promise<{ requestId: string }> {
  const user = await requireRequester(db, userId);
  const alreadyOpen = () =>
    conflict('Your data download is already being prepared.', { reason: 'export_open' });
  if (await findOpenRequest(db, user.id, 'export')) throw alreadyOpen();

  const verdict = await consume(
    db,
    `privacy_export:${user.id}`,
    EXPORTS_PER_WINDOW,
    EXPORT_WINDOW_SEC,
    deps.now,
  );
  if (!verdict.allowed) throw rateLimited('You can request your data 3 times in 30 days.');

  const registry = await resolveRegistry(deps.registry);
  const requestId = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(privacyRequests).values({
        id: requestId,
        userId: user.id,
        kind: 'export',
        status: 'running',
      });
      const steps = registry.handlers.map((handler) => ({
        id: newId(),
        requestId,
        subjectKind: 'user' as const,
        subjectId: user.id,
        module: handler.module,
        phase: 'export' as const,
      }));
      await tx.insert(privacyRequestSteps).values([
        ...steps,
        {
          id: newId(),
          requestId,
          subjectKind: 'user' as const,
          subjectId: user.id,
          module: 'privacy',
          phase: 'finalize' as const,
        },
      ]);
      for (const step of steps) {
        await enqueue(tx, {
          topic: EXPORT_STEP_TOPIC,
          payload: { stepId: step.id },
          dedupeKey: `privacy_step:${step.id}`,
        });
      }
      await record(tx, {
        actorType: 'user',
        actorId: user.id,
        action: 'privacy.export_requested',
        subjectType: 'privacy_request',
        subjectId: requestId,
        data: { modules: steps.length },
      });
    });
  } catch (err) {
    // Two requests at once: the unique index lets one in.
    if (isUniqueViolation(err)) throw alreadyOpen();
    throw err;
  }
  return { requestId };
}

/**
 * Runs one module's exporter and stores its part, with the request row locked from the status
 * check to the last write. A step that is done, or whose request is no longer open (the account
 * was deleted meanwhile), changes nothing. When the last export step finishes, the finalize job
 * is queued.
 */
export async function runExportStep(db: Db, stepId: string, deps: ExportDeps = {}): Promise<void> {
  const step = await loadStep(db, stepId);
  if (!step || step.phase !== 'export') return;
  const storage = deps.storage ?? getStorage();
  const registry = await resolveRegistry(deps.registry);

  let open: boolean;
  try {
    open = await db.transaction(async (tx) => {
      const request = await lockRequest(tx, step.requestId);
      if (!request || request.kind !== 'export' || !isOpen(request.status)) return false;
      const [current] = await tx
        .select({ status: privacyRequestSteps.status })
        .from(privacyRequestSteps)
        .where(eq(privacyRequestSteps.id, step.id));
      if (!current || current.status === 'done') return true;

      const part = await registry.handlerFor(step.module).exportData(tx, subjectOf(step));
      const stored: StoredPart = { records: part.records, missingFiles: [], files: [] };
      const taken = new Set<string>();
      for (const file of part.files) {
        const name = safeFileName(file.name);
        if (taken.has(name)) continue;
        taken.add(name);
        const media = await readMediaForExport(tx, storage, file.mediaId);
        if (!media) {
          stored.missingFiles.push(`files/${step.module}/${name}`);
          continue;
        }
        await storage.write(
          BUCKET,
          partFilePath(request.id, step.module, name),
          media.bytes,
          media.mime,
        );
        stored.files.push(name);
      }
      await storage.write(
        BUCKET,
        partPath(request.id, step.module),
        textBytes(JSON.stringify(stored)),
        'application/json',
      );
      await tx
        .update(privacyRequestSteps)
        .set({ status: 'done', lastError: null })
        .where(eq(privacyRequestSteps.id, step.id));
      return true;
    });
  } catch (err) {
    await db
      .update(privacyRequestSteps)
      .set({ lastError: clipError(safeErrorMessage(err)) })
      .where(and(eq(privacyRequestSteps.id, step.id), ne(privacyRequestSteps.status, 'done')));
    throw err;
  }
  if (!open) return;

  const [left] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(privacyRequestSteps)
    .where(
      and(
        eq(privacyRequestSteps.requestId, step.requestId),
        eq(privacyRequestSteps.phase, 'export'),
        ne(privacyRequestSteps.status, 'done'),
      ),
    );
  if ((left?.n ?? 0) === 0) {
    await enqueue(db, {
      topic: EXPORT_FINALIZE_TOPIC,
      payload: { requestId: step.requestId },
      dedupeKey: `privacy_export_finalize:${step.requestId}`,
    });
  }
}

function readme(i: {
  createdAt: Date;
  userId: string;
  missing: string[];
  expiresAt: Date;
  appUrl: string;
}): string {
  return [
    'Your Explore&Earn data',
    `Created ${i.createdAt.toISOString()} for account ${i.userId}.`,
    '',
    'Each <module>.json file holds what one part of Explore&Earn stores about you.',
    'The files folder holds the files you uploaded.',
    `Files we could not copy: ${i.missing.length > 0 ? i.missing.join(', ') : 'none'}.`,
    '',
    `This download expires on ${i.expiresAt.toISOString().slice(0, 10)}. Questions? Visit ${i.appUrl}/help/contact.`,
    '',
  ].join('\n');
}

/**
 * Zips the parts into `privacy-exports/<requestId>.zip`, completes the request and notifies the
 * person once, with the request row locked from the status check to the update. A retry after
 * the request completed only clears leftover parts; a request the eraser stopped loses
 * everything it wrote, the archive included.
 */
export async function finalizeExport(
  db: Db,
  requestId: string,
  deps: ExportDeps = {},
): Promise<void> {
  const storage = deps.storage ?? getStorage();
  const outcome = await db.transaction(async (tx): Promise<'unknown' | 'stopped' | 'completed'> => {
    const request = await lockRequest(tx, requestId);
    if (!request || request.kind !== 'export') return 'unknown';
    if (request.status === 'completed') return 'completed';
    if (!isOpen(request.status)) return 'stopped';

    const steps = await tx
      .select({ module: privacyRequestSteps.module, status: privacyRequestSteps.status })
      .from(privacyRequestSteps)
      .where(
        and(
          eq(privacyRequestSteps.requestId, request.id),
          eq(privacyRequestSteps.phase, 'export'),
        ),
      );
    if (steps.some((step) => step.status !== 'done')) {
      throw new Error('privacy.export_finalize: export steps are not finished');
    }
    const modules = steps.map((step) => step.module).sort();

    const now = deps.now ?? new Date();
    const ttlDays = await getSetting(tx, 'privacy.export_ttl_days');
    const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS);
    const entries = new Map<string, Uint8Array>();
    const missing: string[] = [];
    const included: string[] = [];
    for (const mod of modules) {
      const part = await readPart(storage, request.id, mod);
      if (!part) throw new Error(`privacy.export_finalize: the ${mod} part is missing`);
      missing.push(...part.missingFiles);
      if (Object.values(part.records).some((rows) => rows.length > 0)) {
        entries.set(`${mod}.json`, textBytes(JSON.stringify(part.records, null, 2)));
        included.push(mod);
      }
      for (const name of part.files) {
        const bytes = await readOrNull(storage, partFilePath(request.id, mod, name));
        if (bytes) entries.set(`files/${mod}/${name}`, bytes);
        else missing.push(`files/${mod}/${name}`);
      }
    }
    const archive = buildZip(
      new Map([
        [
          'README.txt',
          textBytes(
            readme({
              createdAt: now,
              userId: request.userId,
              missing: missing.sort(),
              expiresAt,
              appUrl: getEnv().APP_URL.replace(/\/+$/, ''),
            }),
          ),
        ],
        ...entries,
      ]),
    );
    await storage.write(BUCKET, zipPath(request.id), archive, 'application/zip');

    try {
      const completed = await tx
        .update(privacyRequests)
        .set({
          status: 'completed',
          completedAt: now,
          exportPath: zipPath(request.id),
          exportSizeBytes: archive.byteLength,
          exportExpiresAt: expiresAt,
          blockedReason: null,
        })
        .where(
          and(
            eq(privacyRequests.id, request.id),
            inArray(privacyRequests.status, [...OPEN_STATUSES]),
          ),
        )
        .returning({ id: privacyRequests.id });
      if (completed.length === 0) {
        // The lock should make this impossible. If the request stopped being open anyway,
        // nothing will ever point at the archive, so it must not stay.
        await storage.remove(BUCKET, zipPath(request.id));
        return 'stopped';
      }
      await tx
        .update(privacyRequestSteps)
        .set({ status: 'done', lastError: null })
        .where(
          and(
            eq(privacyRequestSteps.requestId, request.id),
            eq(privacyRequestSteps.phase, 'finalize'),
          ),
        );
      const user = await findUserById(tx, request.userId);
      await notify(tx, request.userId, 'privacy.export_ready', {
        ttlDays,
        url: privacySettingsUrl(user?.accountType ?? null),
      });
      await record(tx, {
        actorType: 'system',
        actorId: null,
        action: 'privacy.export_completed',
        subjectType: 'privacy_request',
        subjectId: request.id,
        data: { bytes: archive.byteLength, modules: included.length },
      });
    } catch (err) {
      // The transaction rolls back, so the request would not point at the archive.
      await storage.remove(BUCKET, zipPath(request.id));
      throw err;
    }
    return 'completed';
  });

  if (outcome === 'stopped') await removeExportFiles(storage, requestId);
  else if (outcome === 'completed') await removeExportParts(storage, requestId);
}

/**
 * A fresh 300-second link to the person's own finished export. Someone else's request, or an
 * unknown one, is `not_found`; an expired one is `gone`.
 */
export async function getExportDownload(
  db: Db,
  i: { userId: string; requestId: string },
  deps: ExportDeps = {},
): Promise<{ url: string }> {
  const request = UUID.test(i.userId) ? await loadRequest(db, i.requestId) : null;
  if (!request || request.kind !== 'export' || request.userId !== i.userId) {
    throw notFound('Download not found');
  }
  const expired = () =>
    gone('This download has expired. Request a new one from your privacy settings.');
  if (request.status !== 'completed') {
    if (request.status === 'failed') throw expired();
    throw conflict('Your data download is not ready yet.', { reason: 'not_ready' });
  }
  const now = deps.now ?? new Date();
  if (!request.exportPath || !request.exportExpiresAt || request.exportExpiresAt <= now) {
    throw expired();
  }

  const url = await (deps.storage ?? getStorage()).signedUrl(
    BUCKET,
    request.exportPath,
    DOWNLOAD_URL_TTL_SEC,
  );
  await record(db, {
    actorType: 'user',
    actorId: i.userId,
    action: 'privacy.export_downloaded',
    subjectType: 'privacy_request',
    subjectId: request.id,
  });
  return { url };
}
