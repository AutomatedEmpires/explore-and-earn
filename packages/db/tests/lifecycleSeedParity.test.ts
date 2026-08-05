/**
 * Contracts <-> DB-seed parity for the lifecycle state machines.
 *
 * The transition maps live twice: packages/contracts/src/lifecycles.ts (used
 * by canTransition() and server guards) and the lifecycle_transition rows
 * seeded by supabase/migrations (enforced by the BEFORE UPDATE triggers).
 * They have drifted before — migration 063 seeded withdrawn->applied while
 * the contracts map lacked it, and shipped decline code assumed an
 * offered->not_selected edge that existed in NEITHER. This test makes any
 * future divergence a CI failure instead of a production surprise.
 *
 * The SQL side is parsed from the migration files themselves (the same text
 * the db-migrate pipeline applies), so the test needs no database.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  APPLICATION_TRANSITIONS,
  INVITE_TRANSITIONS,
  OFFER_TRANSITIONS,
  SCHEDULING_TRANSITIONS,
  type TransitionMap,
} from "@explore-and-earn/contracts";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

type Machine = "application" | "invite" | "offer" | "scheduling";

/** "machine|from|to" edge keys seeded by every migration file. */
function seededEdges(): Set<string> {
  const edges = new Set<string>();
  const tuple = /\(\s*'(application|invite|offer|scheduling)'\s*,\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g;
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    // Only look inside statements that actually seed lifecycle_transition —
    // the tuple shape is too generic to scan whole files safely.
    for (const statement of sql.split(";")) {
      if (!/insert\s+into\s+(?:public\.)?lifecycle_transition/i.test(statement)) continue;
      for (const match of statement.matchAll(tuple)) {
        edges.add(`${match[1]}|${match[2]}|${match[3]}`);
      }
    }
  }
  return edges;
}

function contractEdges(machine: Machine, map: TransitionMap<string>): Set<string> {
  const edges = new Set<string>();
  for (const [from, tos] of Object.entries(map)) {
    for (const to of tos ?? []) {
      edges.add(`${machine}|${from}|${to}`);
    }
  }
  return edges;
}

describe("lifecycle contracts <-> migration-seed parity", () => {
  const seeded = seededEdges();
  const contracts = new Set<string>([
    ...contractEdges("application", APPLICATION_TRANSITIONS),
    ...contractEdges("invite", INVITE_TRANSITIONS),
    ...contractEdges("offer", OFFER_TRANSITIONS),
    ...contractEdges("scheduling", SCHEDULING_TRANSITIONS),
  ]);

  it("parses a plausible seed (guards against a silent parser regression)", () => {
    // 001 alone seeds 20 application edges; an empty or tiny parse means the
    // regex/statement filter broke, not that the seeds vanished.
    expect(seeded.size).toBeGreaterThanOrEqual(20);
  });

  it("every contracts edge is seeded in a migration", () => {
    const missing = [...contracts].filter((e) => !seeded.has(e)).sort();
    expect(missing, `contracts edges missing from SQL seeds: ${missing.join(", ")}`).toEqual([]);
  });

  it("every seeded edge exists in the contracts maps", () => {
    const missing = [...seeded].filter((e) => !contracts.has(e)).sort();
    expect(missing, `SQL-seeded edges missing from contracts: ${missing.join(", ")}`).toEqual([]);
  });
});
