export type LedgerEntry = {
  ledgerId: string;
  userId: string;
  requestId: string;
  erasedAt: string;
};

export interface LedgerMirror {
  put(entry: LedgerEntry): Promise<void>;
  listSince(since: Date): Promise<LedgerEntry[]>;
}

export function makeFakeLedgerMirror(): LedgerMirror & { entries: LedgerEntry[] } {
  const entries: LedgerEntry[] = [];
  return {
    entries,
    async put(entry) {
      entries.push(entry);
    },
    async listSince(since) {
      return entries.filter((entry) => entry.erasedAt >= since.toISOString());
    },
  };
}
