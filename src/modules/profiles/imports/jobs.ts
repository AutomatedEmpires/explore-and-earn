// The import job handlers (SP4 spec 6). W0 stub: W3 implements them (Tasks 16 and 18). The stub
// handlers are no-ops, so neither topic goes dead.
import type { HandlerMap } from '@/modules/jobs';

export const IMPORT_EXTRACT_TOPIC = 'profiles.import_extract';
export const IMPORT_EXPIRE_TOPIC = 'profiles.import_expire';

export const importJobHandlers: HandlerMap = {
  [IMPORT_EXTRACT_TOPIC]: async () => {},
  [IMPORT_EXPIRE_TOPIC]: async () => {},
};
