import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";
import {
  fuzzyIdentityKey,
  parseCsv,
  parseJsonRecords,
  payloadFingerprint,
  planImport,
  recordNeedsReview,
  validateSourceConfig,
  type ImportPlan,
  type InventoryIndex,
  type ExistingListingRef,
  type NormalizedSourceRecord,
  type PlannedRecord,
  type RawSourceRecord,
} from "../lib/sourceIngestion";

/**
 * Sourced-listing persistence: the I/O half of the ingestion engine.
 *
 * SERVICE-ROLE ONLY (imports are a founder/admin operation, invoked by an
 * admin-gated server action — RLS denies these tables to everyone else).
 *
 * LAWS enforced here:
 *  - only sources with compliance_status='approved' may ingest; anything else
 *    returns a typed refusal (the engine never makes the legal call);
 *  - verified listings are NEVER touched by imports;
 *  - every record's fate is preserved as append-only lineage (source_records);
 *  - re-imports are idempotent: a byte-identical payload against the same
 *    source no-ops via the payload fingerprint;
 *  - full-snapshot sources reconcile: sourced listings absent from the run are
 *    marked removed + closed (never deleted — lineage survives);
 *  - benefits land with honest evidence: stated values as 'stated', missing
 *    ones as 'not_stated' with NO value written.
 */

function db(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/* ------------------------------------------------------------------ sources */

export interface ListingSourceRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: "csv" | "json" | "partner_api";
  readonly complianceStatus: "approved" | "pending_review" | "rejected";
  readonly allowRawSnapshot: boolean;
  readonly fullSnapshot: boolean;
  readonly config: unknown;
}

export async function getListingSource(
  sourceId: string,
): Promise<ListingSourceRecord | null> {
  const { data, error } = await db()
    .from("listing_sources")
    .select("id, name, kind, compliance_status, allow_raw_snapshot, full_snapshot, config")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw new Error(`getListingSource: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as ListingSourceRecord["kind"],
    complianceStatus: row.compliance_status as ListingSourceRecord["complianceStatus"],
    allowRawSnapshot: row.allow_raw_snapshot === true,
    fullSnapshot: row.full_snapshot === true,
    config: row.config ?? {},
  };
}

export interface ListingSourceSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: "csv" | "json" | "partner_api";
  readonly complianceStatus: "approved" | "pending_review" | "rejected";
  readonly complianceNotes: string | null;
  readonly termsUrl: string | null;
  readonly fullSnapshot: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** All registered sources for the admin sourcing console (service role). */
export async function listListingSources(): Promise<ListingSourceSummary[]> {
  const { data, error } = await db()
    .from("listing_sources")
    .select(
      "id, name, kind, compliance_status, compliance_notes, terms_url, full_snapshot, created_at, updated_at",
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listListingSources: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as ListingSourceSummary["kind"],
    complianceStatus: row.compliance_status as ListingSourceSummary["complianceStatus"],
    complianceNotes: row.compliance_notes == null ? null : String(row.compliance_notes),
    termsUrl: row.terms_url == null ? null : String(row.terms_url),
    fullSnapshot: row.full_snapshot === true,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export interface UpsertListingSourceInput {
  readonly name: string;
  readonly kind: "csv" | "json" | "partner_api";
  /**
   * Compliance decision — ONLY the founder/admin flips this to 'approved'.
   * Defaults to pending_review: an unreviewed source cannot ingest.
   */
  readonly complianceStatus?: "approved" | "pending_review" | "rejected";
  readonly complianceNotes?: string;
  readonly termsUrl?: string;
  readonly allowRawSnapshot?: boolean;
  readonly fullSnapshot?: boolean;
  readonly config?: unknown;
}

/** Create or update a source registry entry (admin surface). */
export async function upsertListingSource(
  input: UpsertListingSourceInput,
): Promise<{ ok: boolean; sourceId?: string; error?: string }> {
  if (!input.name.trim()) return { ok: false, error: "name_required" };
  if (input.config !== undefined) {
    const validated = validateSourceConfig(input.config);
    if (!validated.ok) {
      return { ok: false, error: `invalid_config: ${validated.errors.join("; ")}` };
    }
  }
  const { data, error } = await db()
    .from("listing_sources")
    .upsert(
      {
        name: input.name.trim(),
        kind: input.kind,
        ...(input.complianceStatus ? { compliance_status: input.complianceStatus } : {}),
        ...(input.complianceNotes !== undefined ? { compliance_notes: input.complianceNotes } : {}),
        ...(input.termsUrl !== undefined ? { terms_url: input.termsUrl } : {}),
        ...(input.allowRawSnapshot !== undefined ? { allow_raw_snapshot: input.allowRawSnapshot } : {}),
        ...(input.fullSnapshot !== undefined ? { full_snapshot: input.fullSnapshot } : {}),
        ...(input.config !== undefined ? { config: input.config } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, sourceId: String((data as { id: string }).id) };
}

/* ---------------------------------------------------------- inventory index */

/**
 * Build the dedup lookups the pure planner consumes. Bounded: sourced rows
 * from THIS source (identity matches) + all live listings' fingerprints and
 * fuzzy keys (cross-inventory duplicate + verified-match detection). Inventory
 * is small at launch; the cap keeps this predictable at scale.
 */
const INDEX_ROW_CAP = 5000;

export async function loadInventoryIndex(sourceId: string): Promise<InventoryIndex> {
  const { data, error } = await db()
    .from("listings")
    .select(
      "id, provenance, source_id, source_external_id, source_url, source_fingerprint, source_employer_name, title, location_display, status, host_profiles(company_name)",
    )
    .in("status", ["live", "paused", "under_review", "draft"])
    .limit(INDEX_ROW_CAP);
  if (error) throw new Error(`loadInventoryIndex: ${error.message}`);

  const byExternalId = new Map<string, ExistingListingRef>();
  const byCanonicalUrl = new Map<string, ExistingListingRef>();
  const byFingerprint = new Map<string, ExistingListingRef>();
  const byFuzzyKey = new Map<string, ExistingListingRef[]>();

  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const ref: ExistingListingRef = {
      listingId: String(raw.id),
      provenance: raw.provenance === "sourced" ? "sourced" : "verified",
      fingerprint: typeof raw.source_fingerprint === "string" ? raw.source_fingerprint : null,
    };

    if (raw.source_id === sourceId && typeof raw.source_external_id === "string") {
      byExternalId.set(`${sourceId}␟${raw.source_external_id}`, ref);
    }
    if (typeof raw.source_url === "string" && raw.source_url) {
      byCanonicalUrl.set(raw.source_url, ref);
    }
    if (ref.fingerprint) byFingerprint.set(ref.fingerprint, ref);

    const hostEmbed = raw.host_profiles as { company_name?: unknown } | Array<{ company_name?: unknown }> | null;
    const hostName = Array.isArray(hostEmbed)
      ? hostEmbed[0]?.company_name
      : hostEmbed?.company_name;
    const employerName =
      typeof raw.source_employer_name === "string"
        ? raw.source_employer_name
        : typeof hostName === "string"
          ? hostName
          : null;
    const fuzzy = fuzzyIdentityKey({
      employerName,
      title: typeof raw.title === "string" ? raw.title : "",
      location: typeof raw.location_display === "string" ? raw.location_display : null,
    });
    if (fuzzy) {
      const list = byFuzzyKey.get(fuzzy) ?? [];
      list.push(ref);
      byFuzzyKey.set(fuzzy, list);
    }
  }

  return { byExternalId, byCanonicalUrl, byFingerprint, byFuzzyKey };
}

/* ------------------------------------------------------------------ imports */

export interface ImportReport {
  readonly ok: boolean;
  readonly runId: string | null;
  readonly error?: string;
  /** Deterministic counters (received/inserted/updated/…); {} on refusal. */
  readonly stats: Readonly<Record<string, number>>;
  /** True when an identical payload was already imported (idempotent no-op). */
  readonly idempotentReplay?: boolean;
  /** Records needing founder review (quarantined / probable duplicates). */
  readonly needsReview: number;
}

const refusal = (error: string): ImportReport => ({
  ok: false,
  runId: null,
  error,
  stats: {},
  needsReview: 0,
});

/** Map a planned record's stated facts onto listings columns — honestly. */
export function plannedToListingColumns(
  entry: PlannedRecord,
  source: ListingSourceRecord,
  nowIso: string,
): Record<string, unknown> {
  const record = entry.record as NormalizedSourceRecord;
  const category = entry.classification?.category;
  if (!category) {
    // Structurally unreachable for inserted/updated outcomes (the planner
    // quarantines unclassifiable records) — refuse loudly rather than ever
    // writing a guessed category.
    throw new Error("plannedToListingColumns: record has no honest category");
  }
  // FACT + FRESHNESS columns only — safe for both insert and update. Identity
  // and ownership columns (provenance / host_profile_id / claim_summary) are
  // added ONLY on insert (see insertColumns): a re-import must never reset an
  // in-flight claim's state or touch ownership on an existing row.
  return {
    status: "live", // a matched sourced row that reappears at the source revives
    source_id: source.id,
    source_name: source.name,
    source_external_id: record.externalId,
    source_url: record.sourceUrl,
    source_employer_name: record.employerName,
    source_published_at: record.publishedAt,
    source_last_seen_at: nowIso,
    source_fingerprint: entry.fingerprint,
    source_status: "active",
    title: record.title,
    category,
    description: record.description,
    location_display: record.location,
    latitude: record.latitude,
    longitude: record.longitude,
    // Benefits: the VALUE columns are only meaningful when stated; the
    // evidence columns are the truth. A not_stated benefit keeps the column
    // default (false) but carries evidence='not_stated' — every read path
    // keys off the evidence, never the bare boolean.
    housing_included: record.housing.status === "stated" ? record.housing.value : false,
    housing_evidence: record.housing.status,
    housing_description: record.housingDetails,
    meals_included: record.meals.status === "stated" ? record.meals.value : false,
    meals_evidence: record.meals.status,
    meals_description: record.mealsDetails,
    pay_evidence:
      record.payText || record.payMinCents != null ? "stated" : "not_stated",
    compensation_summary: record.payText,
    compensation_min_cents: record.payMinCents,
    compensation_max_cents: record.payMaxCents,
    compensation_unit: record.payUnit,
    begins_at: record.beginsAt,
    ends_at: record.endsAt,
    expires_at: record.expiresAt,
    published_at: record.publishedAt ?? nowIso,
    updated_at: nowIso,
  };
}

/** Insert-only columns: identity + ownership, never applied on update. */
export function insertColumns(
  entry: PlannedRecord,
  source: ListingSourceRecord,
  nowIso: string,
): Record<string, unknown> {
  return {
    ...plannedToListingColumns(entry, source, nowIso),
    provenance: "sourced",
    host_profile_id: null,
    claim_summary: "unclaimed",
  };
}

/**
 * Run one import against an APPROVED source. Deterministic, idempotent,
 * lineage-preserving. `dryRun` plans + records nothing (admin preview).
 */
export async function runSourceImport(args: {
  readonly sourceId: string;
  readonly payloadText: string;
  readonly dryRun?: boolean;
  readonly nowMs?: number;
}): Promise<ImportReport & { plan?: ImportPlan }> {
  const client = db();
  const nowIso = new Date(args.nowMs ?? Date.now()).toISOString();

  // ── Compliance gate ────────────────────────────────────────────────────
  const source = await getListingSource(args.sourceId);
  if (!source) return refusal("source_not_found");
  if (source.complianceStatus !== "approved") {
    // The unresolved compliance state is preserved — no silent ingestion,
    // no legal decision made here.
    return refusal(`source_not_approved:${source.complianceStatus}`);
  }

  const configCheck = validateSourceConfig(source.config);
  if (!configCheck.ok) {
    return refusal(`invalid_source_config: ${configCheck.errors.join("; ")}`);
  }

  // ── Parse payload ──────────────────────────────────────────────────────
  let rawRecords: RawSourceRecord[];
  try {
    rawRecords =
      source.kind === "csv"
        ? parseCsv(args.payloadText)
        : parseJsonRecords(args.payloadText);
  } catch (cause) {
    return refusal(`payload_parse_failed: ${cause instanceof Error ? cause.message : "unknown"}`);
  }
  if (rawRecords.length === 0) return refusal("payload_empty");

  // ── Idempotency: identical payload already fully imported → no-op ──────
  const fingerprint = payloadFingerprint(args.payloadText);
  const { data: priorRun } = await client
    .from("source_import_runs")
    .select("id, status")
    .eq("source_id", source.id)
    .eq("payload_fingerprint", fingerprint)
    .eq("status", "completed")
    .maybeSingle();
  if (priorRun && !args.dryRun) {
    return {
      ok: true,
      runId: String((priorRun as { id: string }).id),
      stats: { received: rawRecords.length },
      idempotentReplay: true,
      needsReview: 0,
    };
  }

  // ── Plan against current inventory ─────────────────────────────────────
  const index = await loadInventoryIndex(source.id);
  const plan = planImport(rawRecords, configCheck.mapping, source.id, index);
  const needsReview = plan.records.filter(
    (entry) => recordNeedsReview(entry),
  ).length;

  if (args.dryRun) {
    return { ok: true, runId: null, stats: plan.stats, needsReview, plan };
  }

  // ── Execute ────────────────────────────────────────────────────────────
  const { data: runRow, error: runError } = await client
    .from("source_import_runs")
    .insert({ source_id: source.id, payload_fingerprint: fingerprint, status: "running" })
    .select("id")
    .single();
  if (runError) return refusal(`run_create_failed: ${runError.message}`);
  const runId = String((runRow as { id: string }).id);

  const seenListingIds = new Set<string>();
  try {
    for (const entry of plan.records) {
      let listingId: string | null = entry.matchedListingId;

      let effectiveOutcome = entry.outcome;
      if (entry.outcome === "inserted") {
        const { data: inserted, error: insertError } = await client
          .from("listings")
          .insert(insertColumns(entry, source, nowIso))
          .select("id")
          .single();
        if (insertError) {
          // A concurrent import already inserted this posting (the partial
          // unique indexes on external id / canonical URL) — record it as an
          // exact duplicate instead of failing the whole run.
          if (insertError.code === "23505") {
            effectiveOutcome = "exact_duplicate";
          } else {
            throw new Error(`listing insert failed: ${insertError.message}`);
          }
        } else {
          listingId = String((inserted as { id: string }).id);
        }
      } else if (entry.outcome === "updated" && entry.matchedListingId) {
        const { error: updateError } = await client
          .from("listings")
          .update(plannedToListingColumns(entry, source, nowIso))
          .eq("id", entry.matchedListingId)
          .eq("provenance", "sourced"); // verified rows are untouchable, always
        if (updateError) throw new Error(`listing update failed: ${updateError.message}`);
      } else if (entry.outcome === "unchanged" && entry.matchedListingId) {
        // Freshness only: the posting is still present at the source.
        await client
          .from("listings")
          .update({ source_last_seen_at: nowIso, source_status: "active" })
          .eq("id", entry.matchedListingId)
          .eq("provenance", "sourced");
      }

      if (listingId && entry.outcome !== "verified_match") seenListingIds.add(listingId);

      // Append-only lineage — every record's fate, forever.
      const { error: lineageError } = await client.from("source_records").insert({
        source_id: source.id,
        import_run_id: runId,
        external_id: entry.record?.externalId ?? null,
        content_fingerprint: entry.fingerprint ?? "unparsed",
        raw: source.allowRawSnapshot ? entry.raw : null,
        normalized: entry.record ?? {},
        outcome: effectiveOutcome,
        reject_reason: entry.rejectReason,
        classification: entry.classification ?? {},
        needs_review: recordNeedsReview(entry),
        listing_id: effectiveOutcome === "inserted" ? listingId : null,
        matched_listing_id: entry.matchedListingId,
      });
      if (lineageError) throw new Error(`lineage insert failed: ${lineageError.message}`);
    }

    // ── Full-snapshot reconciliation: postings gone from the source ──────
    // SAFETY: reconciliation only runs on a CLEAN snapshot. If any record was
    // rejected or quarantined, its listing may be present-at-source but
    // unmatched this run — closing it would remove a live posting. Better a
    // possibly-stale listing (the freshness sweep bounds that) than a
    // wrongly-removed one; the skip is recorded in the run stats.
    let removed = 0;
    let reconcileSkipped = 0;
    const unparsedCount =
      (plan.stats.rejected ?? 0) + (plan.stats.quarantined ?? 0);
    if (source.fullSnapshot && unparsedCount > 0) {
      reconcileSkipped = unparsedCount;
    }
    if (source.fullSnapshot && unparsedCount === 0) {
      const { data: stale } = await client
        .from("listings")
        .select("id")
        .eq("source_id", source.id)
        .eq("provenance", "sourced") // verified conversions are PRESERVED
        .eq("status", "live")
        .lt("source_last_seen_at", nowIso);
      const staleIds = ((stale ?? []) as Array<{ id: string }>)
        .map((row) => String(row.id))
        .filter((id) => !seenListingIds.has(id));
      if (staleIds.length > 0) {
        const { error: removeError } = await client
          .from("listings")
          .update({
            source_status: "removed",
            status: "closed",
            closed_at: nowIso,
            updated_at: nowIso,
          })
          .in("id", staleIds)
          .eq("provenance", "sourced");
        if (removeError) throw new Error(`reconcile failed: ${removeError.message}`);
        removed = staleIds.length;
      }
    }

    const stats = {
      ...plan.stats,
      ...(removed > 0 ? { removed } : {}),
      ...(reconcileSkipped > 0
        ? { reconcile_skipped_unclean_snapshot: reconcileSkipped }
        : {}),
    };
    await client
      .from("source_import_runs")
      .update({ status: "completed", stats, finished_at: new Date().toISOString() })
      .eq("id", runId);

    return { ok: true, runId, stats, needsReview };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "import_failed";
    await client
      .from("source_import_runs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", runId);
    return { ok: false, runId, error: message, stats: plan.stats, needsReview };
  }
}

/* -------------------------------------------------------- review + lineage */

export interface SourceRecordReviewRow {
  readonly id: string;
  readonly sourceId: string;
  readonly outcome: string;
  readonly rejectReason: string | null;
  readonly classification: unknown;
  readonly normalized: unknown;
  readonly matchedListingId: string | null;
  readonly createdAt: string;
}

/** Records awaiting founder review (quarantined + probable duplicates). */
export async function getRecordsNeedingReview(
  limit = 50,
): Promise<SourceRecordReviewRow[]> {
  const { data, error } = await db()
    .from("source_records")
    .select("id, source_id, outcome, reject_reason, classification, normalized, matched_listing_id, created_at")
    .eq("needs_review", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecordsNeedingReview: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    sourceId: String(row.source_id),
    outcome: String(row.outcome),
    rejectReason: typeof row.reject_reason === "string" ? row.reject_reason : null,
    classification: row.classification,
    normalized: row.normalized,
    matchedListingId:
      typeof row.matched_listing_id === "string" ? row.matched_listing_id : null,
    createdAt: String(row.created_at),
  }));
}

/**
 * Import lineage for one listing: which source, runs, and outcomes produced
 * it — the system can always explain where a listing came from.
 */
export async function getListingLineage(listingId: string): Promise<
  ReadonlyArray<{ runId: string; outcome: string; createdAt: string }>
> {
  const { data, error } = await db()
    .from("source_records")
    .select("import_run_id, outcome, created_at")
    .or(`listing_id.eq.${listingId},matched_listing_id.eq.${listingId}`)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getListingLineage: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    runId: String(row.import_run_id),
    outcome: String(row.outcome),
    createdAt: String(row.created_at),
  }));
}
