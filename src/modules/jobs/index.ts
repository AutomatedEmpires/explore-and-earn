// Public API of the jobs module (outbox, worker, scheduler). Owned by W3 (Task 9).
import type { HandlerMap } from './worker';

export { emit, readEnvelope, type EventEnvelope } from './events';
export { enqueue, kickWorker, type EnqueueInput } from './outbox';
export { enqueueDueSchedules, lastDueAt, type Schedule } from './schedule';
export {
  LOCK_TIMEOUT_MINUTES,
  MAX_ATTEMPTS,
  nextDelayMs,
  runWorker,
  type Handler,
  type HandlerMap,
  type WorkerOptions,
  type WorkerResult,
} from './worker';

export const jobHandlers: HandlerMap = {};
