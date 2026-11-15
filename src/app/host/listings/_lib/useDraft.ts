'use client';

// The builder's draft with autosave (spec section 8.2 and failure modes 4 and 5). Each edit
// marks its section; a short pause later the section is PATCHed with its base version. A stale
// version (409 section_conflict) is rebased once and saved again, keeping what this host typed.
// Offline, edits stay on the device and are sent when the connection comes back.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuilderSection } from '@/modules/listings';
import { ApiError, api } from './api';
import { clearLocal, writeLocal } from './local';
import { sectionOfPath, sectionPayload, type BuilderContext, type Raw } from './model';
import { setPath, type Json } from './paths';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

export type DraftState = {
  draft: Json;
  raw: Raw;
  status: SaveStatus;
  /** A section someone else changed while this host was editing it. */
  conflict: BuilderSection | null;
  /** Whether anything is waiting to be saved. */
  pending: boolean;
  /** When a save last succeeded (ms), 0 before the first. */
  savedAt: number;
  /** Sets a value; `text` keeps what the host typed for a parsed input. */
  set: (path: string, value: unknown, text?: { key: string; value: string }) => void;
  /** Several edits as one; `text` keeps what was typed. */
  update: (
    edit: (draft: Json) => Json,
    sections: BuilderSection[],
    text?: { key: string; value: string },
  ) => void;
  /** Keeps what was typed without changing the draft. */
  setText: (key: string, value: string) => void;
  /** Saves everything now. Resolves true when nothing is left to save. */
  flush: () => Promise<boolean>;
  dismissConflict: () => void;
};

export function useDraft(opts: {
  listingId: string;
  initialDraft: Json;
  initialRaw?: Raw;
  initialDirty?: BuilderSection[];
  versions: Partial<Record<BuilderSection, number>>;
  ctx: BuilderContext;
  /** A pause after the last keystroke before saving. */
  delayMs?: number;
  /** For a preview without a server. */
  disabled?: boolean;
}): DraftState {
  const { listingId, ctx, delayMs = 800, disabled = false } = opts;
  const [draft, setDraft] = useState<Json>(opts.initialDraft);
  const [raw, setRaw] = useState<Raw>(opts.initialRaw ?? {});
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [conflict, setConflict] = useState<BuilderSection | null>(null);
  const [pending, setPending] = useState((opts.initialDirty ?? []).length > 0);
  const [savedAt, setSavedAt] = useState(0);

  const draftRef = useRef(draft);
  const rawRef = useRef(raw);
  const versions = useRef({ ...opts.versions });
  const dirty = useRef(new Set<BuilderSection>(opts.initialDirty ?? []));
  const edits = useRef(new Map<BuilderSection, number>());
  const inFlight = useRef(new Map<BuilderSection, Promise<void>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  const remember = useCallback(() => {
    if (dirty.current.size === 0) {
      clearLocal(listingId);
      return;
    }
    writeLocal(listingId, {
      draft: draftRef.current,
      raw: rawRef.current,
      dirty: [...dirty.current],
      at: Date.now(),
    });
  }, [listingId]);

  const send = useCallback(
    (section: BuilderSection): Promise<void> => {
      const running = inFlight.current.get(section);
      if (running) return running;
      const run = (async () => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const seq = edits.current.get(section) ?? 0;
          setStatus({ kind: 'saving' });
          try {
            const res = await api.patchDraft(listingId, {
              section,
              baseVersion: versions.current[section] ?? 0,
              data: sectionPayload(section, draftRef.current, ctxRef.current),
            });
            versions.current = { ...versions.current, ...res.sectionVersions };
            if ((edits.current.get(section) ?? 0) === seq) dirty.current.delete(section);
            const at = new Date();
            setStatus({ kind: 'saved', at });
            setSavedAt(at.getTime());
            return;
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            if (err.offline) {
              setStatus({ kind: 'offline' });
              return;
            }
            if (err.reason === 'section_conflict' && attempt === 0) {
              const d = err.details as { version?: unknown };
              if (typeof d.version === 'number') versions.current[section] = d.version;
              setConflict(section);
              continue;
            }
            setStatus({ kind: 'error', message: err.message });
            return;
          }
        }
      })().finally(() => {
        inFlight.current.delete(section);
        setPending(dirty.current.size > 0);
        remember();
      });
      inFlight.current.set(section, run);
      return run;
    },
    [listingId, remember],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (disabled) return true;
    // Sections edited while a save was running are sent again once it ends.
    for (let round = 0; round < 3 && dirty.current.size > 0; round += 1) {
      await Promise.all([...inFlight.current.values()]);
      await Promise.all([...dirty.current].map((s) => send(s)));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
    }
    return dirty.current.size === 0;
  }, [disabled, send]);

  const schedule = useCallback(() => {
    setPending(true);
    remember();
    if (disabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delayMs);
  }, [delayMs, disabled, flush, remember]);

  const mark = useCallback((section: BuilderSection) => {
    dirty.current.add(section);
    edits.current.set(section, (edits.current.get(section) ?? 0) + 1);
  }, []);

  const keepText = useCallback((text?: { key: string; value: string }) => {
    if (!text) return;
    rawRef.current = { ...rawRef.current, [text.key]: text.value };
    setRaw(rawRef.current);
  }, []);

  const set = useCallback<DraftState['set']>(
    (path, value, text) => {
      draftRef.current = setPath(draftRef.current, path, value);
      setDraft(draftRef.current);
      keepText(text);
      mark(sectionOfPath(path));
      schedule();
    },
    [keepText, mark, schedule],
  );

  const update = useCallback<DraftState['update']>(
    (edit, sections, text) => {
      draftRef.current = edit(draftRef.current);
      setDraft(draftRef.current);
      keepText(text);
      for (const s of sections) mark(s);
      schedule();
    },
    [keepText, mark, schedule],
  );

  const setText = useCallback<DraftState['setText']>(
    (key, value) => {
      keepText({ key, value });
      remember();
    },
    [keepText, remember],
  );

  // Send what is waiting as soon as the connection is back.
  useEffect(() => {
    const online = () => void flush();
    const offline = () => {
      if (dirty.current.size > 0) setStatus({ kind: 'offline' });
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    if (dirty.current.size > 0) void flush();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [flush]);

  // Leaving the page with unsaved edits: the copy on this device keeps them.
  useEffect(() => {
    const leave = () => remember();
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [remember]);

  return {
    draft,
    raw,
    status,
    conflict,
    pending,
    savedAt,
    set,
    update,
    setText,
    flush,
    dismissConflict: () => setConflict(null),
  };
}
