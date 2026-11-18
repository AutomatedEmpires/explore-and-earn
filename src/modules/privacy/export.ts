// Data export (SP8 spec 8.1). One outbox step per module writes that module's part to the
// private `privacy-exports` bucket; the finalize step zips the parts, deletes them and tells the
// person. A download is a fresh 300-second signed URL each time, and stops after the TTL.
//
// Export contents are personal data. They are written to storage and nowhere else: never to a
// log, an audit row, an outbox payload or an error message.
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/lib/db';
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
  privacySettingsUrl,
  requireRequester,
  resolveRegistry,
  subjectOf,
  UUID,
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

/** Deletes every part of a request. Safe to repeat: a part that is gone is skipped. */
export async function removeExportParts(
  storage: Storage,
  requestId: string,
  modules: readonly string[],
): Promise<void> {
  for (const mod of modules) {
    const part = await readPart(storage, requestId, mod);
    if (!part) continue;
    for (const name of part.files) {
      await storage.remove(BUCKET, partFilePath(requestId, mod, name));
    }
    await storage.remove(BUCKET, partPath(requestId, mod));
  }
}

/** Deletes a finished export's archive. A missing object is not an error. */
export async function removeExportArchive(storage: Storage, exportPath: string): Promise<void> {
  await storage.remove(BUCKET, exportPath);
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
 * Runs one module's exporter and stores its part. A step that is done, or whose request is no
 * longer running (the account was deleted meanwhile), changes nothing. When the last export
 * step finishes, the finalize job is queued.
 */
export async function runExportStep(db: Db, stepId: string, deps: ExportDeps = {}): Promise<void> {
  const step = await loadStep(db, stepId);
  if (!step || step.phase !== 'export') return;
  const request = await loadRequest(db, step.requestId);
  if (!request || request.kind !== 'export' || request.status === 'completed') return;
  if (request.status === 'failed') return;

  if (step.status !== 'done') {
    const storage = deps.storage ?? getStorage();
    const registry = await resolveRegistry(deps.registry);
    try {
      const part = await registry.handlerFor(step.module).exportData(db, subjectOf(step));
      const stored: StoredPart = { records: part.records, missingFiles: [], files: [] };
      const taken = new Set<string>();
      for (const file of part.files) {
        const name = safeFileName(file.name);
        if (taken.has(name)) continue;
        taken.add(name);
        const media = await readMediaForExport(db, storage, file.mediaId);
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
      await db
        .update(privacyRequestSteps)
        .set({ status: 'done', lastError: null })
        .where(and(eq(privacyRequestSteps.id, step.id), ne(privacyRequestSteps.status, 'done')));
    } catch (err) {
      await db
        .update(privacyRequestSteps)
        .set({ lastError: clipError(safeErrorMessage(err)) })
        .where(eq(privacyRequestSteps.id, step.id));
      throw err;
    }
  }

  const [left] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(privacyRequestSteps)
    .where(
      and(
        eq(privacyRequestSteps.requestId, request.id),
        eq(privacyRequestSteps.phase, 'export'),
        ne(privacyRequestSteps.status, 'done'),
      ),
    );
  if ((left?.n ?? 0) === 0) {
    await enqueue(db, {
      topic: EXPORT_FINALIZE_TOPIC,
      payload: { requestId: request.id },
      dedupeKey: `privacy_export_finalize:${request.id}`,
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
 * person once. A retry after the request completed only clears leftover parts.
 */
export async function finalizeExport(
  db: Db,
  requestId: string,
  deps: ExportDeps = {},
): Promise<void> {
  const request = await loadRequest(db, requestId);
  if (!request || request.kind !== 'export') return;
  const storage = deps.storage ?? getStorage();
  const steps = await db
    .select({ module: privacyRequestSteps.module, status: privacyRequestSteps.status })
    .from(privacyRequestSteps)
    .where(
      and(eq(privacyRequestSteps.requestId, request.id), eq(privacyRequestSteps.phase, 'export')),
    );
  const modules = steps.map((step) => step.module).sort();

  if (request.status === 'completed' || request.status === 'failed') {
    await removeExportParts(storage, request.id, modules);
    return;
  }
  if (steps.some((step) => step.status !== 'done')) {
    throw new Error('privacy.export_finalize: export steps are not finished');
  }

  const now = deps.now ?? new Date();
  const ttlDays = await getSetting(db, 'privacy.export_ttl_days');
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

  await db.transaction(async (tx) => {
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
          inArray(privacyRequests.status, ['running', 'needs_action']),
        ),
      )
      .returning({ id: privacyRequests.id });
    if (completed.length === 0) return;
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
  });

  await removeExportParts(storage, request.id, modules);
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
