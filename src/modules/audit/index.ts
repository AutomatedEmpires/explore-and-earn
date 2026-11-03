// Public API of the audit module (append-only audit log). Owned by W3 (Task 10).
import type { HandlerMap } from '@/modules/jobs';

export { record, redact, type AuditEventInput } from './record';
export { searchAudit, type AuditEvent, type AuditSearch } from './search';

export const jobHandlers: HandlerMap = {};
