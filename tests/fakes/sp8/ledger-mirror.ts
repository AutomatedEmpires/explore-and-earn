export type LedgerEntry = {
  ledgerId: string;
  userId: string;
  requestId: string;
  erasedAt: string;
};

/** One mirrored legal hold: ids, scope and times. The reason is never mirrored. */
export type HoldEntry = {
  holdId: string;
  userId: string | null;
  orgId: string | null;
  scope: 'all' | 'applications' | 'messages' | 'reports' | 'billing';
  reviewAt: string;
  createdBy: string;
  createdAt: string;
  releasedAt: string | null;
  releasedBy: string | null;
};

export interface LedgerMirror {
  put(entry: LedgerEntry): Promise<void>;
  listSince(since: Date): Promise<LedgerEntry[]>;
  putHold(entry: HoldEntry): Promise<void>;
  listHolds(): Promise<HoldEntry[]>;
}

export function makeFakeLedgerMirror(): LedgerMirror & {
  entries: LedgerEntry[];
  holds: HoldEntry[];
} {
  const entries: LedgerEntry[] = [];
  const holds: HoldEntry[] = [];
  return {
    entries,
    holds,
    async put(entry) {
      entries.push(entry);
    },
    async listSince(since) {
      return entries.filter((entry) => entry.erasedAt >= since.toISOString());
    },
    async putHold(entry) {
      const at = holds.findIndex((hold) => hold.holdId === entry.holdId);
      if (at === -1) holds.push(entry);
      else holds[at] = entry;
    },
    async listHolds() {
      return [...holds];
    },
  };
}
