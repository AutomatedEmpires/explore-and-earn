import type { MediaColumnRef, PrivacyHandler } from './types';

function notReady(): never {
  throw new Error('not implemented: privacyHandler (W1)');
}

/** A W0 handler. The owning workstream replaces exportData and erase; the tables stay. */
export function stubPrivacyHandler(
  module: string,
  tables: readonly string[],
  mediaColumns?: readonly MediaColumnRef[],
): PrivacyHandler {
  return {
    module,
    tables,
    ...(mediaColumns ? { mediaColumns } : {}),
    exportData: async () => notReady(),
    erase: async () => notReady(),
  };
}
