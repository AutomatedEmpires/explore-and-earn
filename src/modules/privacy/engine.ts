// The privacy engine's barrel (Plan decision 32): legal holds, the module's own handler,
// export, deletion, the ledger mirror and the overdue watch. Loading it registers the engine's
// job handlers, its dead-letter follow-ups and the `privacy_request` trust subject.
import { z } from 'zod';
import { registerDeadLetterHandler, type HandlerMap } from '@/modules/jobs';
import {
  deactivateRequester,
  eraseAfterHoldRelease,
  finalizeDeletion,
  handleDeadStep,
  runEraseStep,
} from './erase';
import { finalizeExport, runExportStep } from './export';
import { HOLD_MIRROR_TOPIC, HOLD_RELEASE_ERASE_TOPIC } from './holds';
import { mirrorLedgerEntry, mirrorLegalHold } from './mirror';
import {
  DEACTIVATE_TOPIC,
  ERASE_FINALIZE_TOPIC,
  ERASE_STEP_TOPIC,
  EXPORT_FINALIZE_TOPIC,
  EXPORT_STEP_TOPIC,
  LEDGER_MIRROR_TOPIC,
  REQUEST_WATCH_TOPIC,
} from './requests';
import { registerPrivacySubjects } from './subjects';
import { watchRequests } from './watch';

export {
  activeHolds,
  applyMirroredHold,
  HOLD_MIRROR_TOPIC,
  HOLD_RELEASE_ERASE_TOPIC,
  holdsInclude,
  isOnLegalHold,
  listLegalHolds,
  releaseLegalHold,
  setLegalHold,
  type LegalHoldRow,
} from './holds';
export { privacyHandler } from './privacy';
export {
  listPrivacyRequests,
  listPrivacyRequestsForConsole,
  type ConsolePrivacyRequest,
} from './requests';
export {
  finalizeExport,
  getExportDownload,
  requestExport,
  runExportStep,
  type ExportDeps,
} from './export';
export {
  advanceErasure,
  eraseAfterHoldRelease,
  finalizeDeletion,
  FINALIZE_MODULES,
  isBeingErased,
  LAST_WAVE_MODULES,
  replayErasure,
  requestDeletion,
  runEraseStep,
  type EraseDeps,
} from './erase';
export {
  getLedgerMirror,
  mirrorLedgerEntry,
  mirrorLegalHold,
  NOOP_LEDGER_MIRROR,
  type HoldEntry,
  type LedgerEntry,
  type LedgerMirror,
} from './mirror';
export { watchRequests } from './watch';

const stepPayload = z.object({ stepId: z.uuid() });
const requestPayload = z.object({ requestId: z.uuid() });
const ledgerPayload = z.object({ ledgerId: z.uuid() });
const holdPayload = z.object({ holdId: z.uuid() });

export const engineJobHandlers: HandlerMap = {
  [EXPORT_STEP_TOPIC]: async (payload, { db, now }) => {
    await runExportStep(db, stepPayload.parse(payload).stepId, { now });
  },
  [EXPORT_FINALIZE_TOPIC]: async (payload, { db, now }) => {
    await finalizeExport(db, requestPayload.parse(payload).requestId, { now });
  },
  [DEACTIVATE_TOPIC]: async (payload, { db }) => {
    await deactivateRequester(db, requestPayload.parse(payload).requestId);
  },
  [ERASE_STEP_TOPIC]: async (payload, { db, now }) => {
    await runEraseStep(db, stepPayload.parse(payload).stepId, { now });
  },
  [ERASE_FINALIZE_TOPIC]: async (payload, { db, now }) => {
    await finalizeDeletion(db, requestPayload.parse(payload).requestId, { now });
  },
  [LEDGER_MIRROR_TOPIC]: async (payload, { db, now }) => {
    await mirrorLedgerEntry(db, ledgerPayload.parse(payload).ledgerId, { now });
  },
  [HOLD_MIRROR_TOPIC]: async (payload, { db }) => {
    await mirrorLegalHold(db, holdPayload.parse(payload).holdId);
  },
  [HOLD_RELEASE_ERASE_TOPIC]: async (payload, { db, now }) => {
    await eraseAfterHoldRelease(db, requestPayload.parse(payload).requestId, { now });
  },
  [REQUEST_WATCH_TOPIC]: async (_payload, { db, now }) => {
    await watchRequests(db, now);
  },
};

// A step whose job is dead reaches its request here (Plan decision 11), not through a sweep.
for (const topic of [
  EXPORT_STEP_TOPIC,
  EXPORT_FINALIZE_TOPIC,
  ERASE_STEP_TOPIC,
  ERASE_FINALIZE_TOPIC,
]) {
  registerDeadLetterHandler(topic, (db, e) => handleDeadStep(db, topic, e));
}

registerPrivacySubjects();
