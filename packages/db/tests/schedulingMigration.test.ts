import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = readFileSync(
  join(ROOT, "supabase", "migrations", "088_application_interview_scheduling.sql"),
  "utf8",
);
const CONCURRENCY_RUNNER = readFileSync(
  join(ROOT, "tools", "db-assert", "assert-interview-scheduling-concurrency.mjs"),
  "utf8",
);
const DB_SECURITY_WORKFLOW = readFileSync(
  join(ROOT, ".github", "workflows", "db-security.yml"),
  "utf8",
);
const DB_ASSERT_PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "tools", "db-assert", "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("migration 088 interview scheduling security", () => {
  it("explicitly exposes SELECT only, enables RLS, and scopes both tables to parties", () => {
    expect(SQL).toMatch(/alter table public\.scheduling_requests enable row level security/i);
    expect(SQL).toMatch(/alter table public\.scheduling_options enable row level security/i);
    expect(SQL).toMatch(/create policy scheduling_requests_select_party[\s\S]*?to authenticated[\s\S]*?current_seeker_profile_ids[\s\S]*?current_host_listing_ids/i);
    expect(SQL).toMatch(/create policy scheduling_options_select_party[\s\S]*?to authenticated[\s\S]*?current_seeker_profile_ids[\s\S]*?current_host_listing_ids/i);
    expect(SQL).toMatch(/revoke all on table public\.scheduling_requests from public, anon, authenticated/i);
    expect(SQL).toMatch(/grant select on table public\.scheduling_requests to authenticated/i);
    expect(SQL).toMatch(/grant select on table public\.scheduling_options to authenticated/i);
    expect(SQL).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]*to authenticated/i);
  });

  it("locks every mutation RPC to service-role execution with a server-supplied Clerk actor", () => {
    for (const name of [
      "propose_my_host_scheduling_request",
      "respond_to_my_scheduling_request",
      "cancel_my_scheduling_request",
      "resolve_my_host_scheduling_request",
    ]) {
      const start = SQL.indexOf(`function public.${name}`);
      expect(start).toBeGreaterThan(-1);
      const body = SQL.slice(start, SQL.indexOf("$$;", start) + 3);
      expect(body).toMatch(/security definer/i);
      expect(body).toMatch(/set search_path = ''/i);
      expect(body).toMatch(/p_clerk_user_id text/i);
      expect(body).toMatch(/nullif\(btrim\(p_clerk_user_id\), ''\)/i);
      expect(SQL).toMatch(new RegExp(`revoke execute on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`, "i"));
      expect(SQL).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`, "i"));
    }
    expect(SQL).not.toMatch(/p_(?:host|seeker)_profile_id/i);
  });

  it("pins active uniqueness, option ownership, cardinality, future bounds and canonical lifecycle", () => {
    expect(SQL).toMatch(/unique index scheduling_requests_one_active_per_application[\s\S]*?where status in \('proposed', 'selected', 'alternate_requested'\)/i);
    expect(SQL).toMatch(/scheduling_selected_option_mismatch/i);
    expect(SQL).toMatch(/v_slot_count not between 1 and 3/i);
    expect(SQL).toMatch(/slot <= clock_timestamp\(\) \+ interval '4 hours'/i);
    expect(SQL).toMatch(/slot > clock_timestamp\(\) \+ interval '180 days'/i);
    expect(SQL).toMatch(/execute function public\.enforce_lifecycle_transition\('scheduling'\)/i);
    expect(SQL).toMatch(/status in \('selected', 'completed', 'no_show'\) and selected_option_id is not null/i);
    expect(SQL).toMatch(/or status in \('cancelled', 'expired'\)/i);
    expect(SQL).toMatch(/scheduling_requests_selected_option_idx[\s\S]*?where selected_option_id is not null/i);
    expect(SQL).not.toMatch(/create index scheduling_options_request_round_idx/i);
  });

  it("captures immutable listing identity when the host first proposes", () => {
    expect(SQL).toMatch(/listing_title\s+text not null/i);
    expect(SQL).toMatch(
      /select a\.status, l\.title\s+into v_application_status, v_listing_title/i,
    );
    expect(SQL).toMatch(
      /insert into public\.scheduling_requests \([\s\S]*?application_id,\s*listing_title,[\s\S]*?values \([\s\S]*?p_application_id,\s*v_listing_title,/i,
    );
    expect(SQL).toMatch(
      /create trigger trg_scheduling_requests_listing_title_immutable[\s\S]*?before update of listing_title/i,
    );
    expect(SQL).toMatch(
      /new\.listing_title is distinct from old\.listing_title[\s\S]*?scheduling_listing_title_immutable[\s\S]*?23514/i,
    );
  });

  it("serializes seeker selections, rejects overlaps, and grants a no-show grace period", () => {
    expect(SQL).toMatch(/pg_advisory_xact_lock/i);
    expect(SQL).toMatch(/other_application\.seeker_profile_id = v_seeker_profile_id/i);
    expect(SQL).toMatch(/tstzrange\(other_option\.starts_at, other_option\.ends_at, '\[\)'\)[\s\S]*?&& tstzrange\(v_selected_start, v_selected_end, '\[\)'\)/i);
    expect(SQL).toMatch(/scheduling_time_conflict/i);
    expect(SQL).toMatch(/v_starts_at \+ interval '15 minutes' > clock_timestamp\(\)/i);
  });

  it("gives every alternative-request round a fresh response window", () => {
    expect(SQL).toMatch(
      /set status = 'alternate_requested',[\s\S]*?expires_at = clock_timestamp\(\) \+ interval '72 hours'/i,
    );
    expect(SQL).toMatch(
      /elsif v_request_status = 'alternate_requested'[\s\S]*?set status = 'proposed',[\s\S]*?expires_at = v_expires_at/i,
    );
  });

  it("platform-cancels active interviews for every terminal application writer", () => {
    expect(SQL).toMatch(/create trigger trg_applications_cancel_scheduling[\s\S]*?after update of status on public\.applications/i);
    expect(SQL).toMatch(/new\.status in \('not_selected', 'withdrawn', 'expired'\)/i);
    expect(SQL).toMatch(/set status = 'cancelled',[\s\S]*?cancelled_by = 'platform'/i);
    expect(SQL).toMatch(/status in \('proposed', 'selected', 'alternate_requested'\)/i);
  });

  it("keeps proposal rounds immutable through client grants and does not enable Realtime", () => {
    expect(SQL).not.toMatch(/update public\.scheduling_options/i);
    expect(SQL).not.toMatch(/delete from public\.scheduling_options/i);
    expect(SQL).not.toMatch(/supabase_realtime/i);
  });

  it("records every scheduling lifecycle event transactionally", () => {
    expect(SQL).toMatch(/create trigger trg_scheduling_requests_event_insert[\s\S]*?after insert/i);
    expect(SQL).toMatch(/create trigger trg_scheduling_requests_event_status[\s\S]*?after update of status/i);
    for (const event of [
      "scheduling_request_sent",
      "scheduling_time_selected",
      "scheduling_alternate_requested",
      "scheduling_cancelled",
      "scheduling_completed",
      "scheduling_expired",
      "scheduling_no_show_reported",
    ]) {
      expect(SQL).toContain(`'${event}'`);
    }
    expect(SQL).toMatch(/insert into public\.events/i);
    expect(SQL).toMatch(/'scheduling_lifecycle_trigger'/i);
    expect(SQL).toMatch(
      /old\.status in \('proposed', 'alternate_requested'\)[\s\S]*?new\.status = 'selected'[\s\S]*?scheduling_time_selected/i,
    );
    expect(SQL).toMatch(
      /old\.status in \('proposed', 'selected', 'alternate_requested'\)[\s\S]*?new\.status = 'expired'[\s\S]*?scheduling_expired/i,
    );
  });

  it("registers a real two-session overlap proof in DB Security", () => {
    expect(CONCURRENCY_RUNNER).toContain(
      'import { assertLocalTarget } from "./run-sql.mjs"',
    );
    expect(CONCURRENCY_RUNNER).toMatch(
      /sessionA = openSession\(\)[\s\S]*?sessionB = openSession\(\)/,
    );
    expect(CONCURRENCY_RUNNER).toContain("wait_event_type = 'Lock'");
    expect(CONCURRENCY_RUNNER).toContain("scheduling_time_conflict");
    expect(CONCURRENCY_RUNNER).toContain("23P01");
    expect(CONCURRENCY_RUNNER).toContain("30 days 30 minutes");
    expect(DB_SECURITY_WORKFLOW).toContain(
      "node tools/db-assert/assert-interview-scheduling-concurrency.mjs",
    );
    expect(DB_ASSERT_PACKAGE.scripts["assert:interview-concurrency"]).toBe(
      "node ./assert-interview-scheduling-concurrency.mjs",
    );
    expect(DB_ASSERT_PACKAGE.scripts["verify:security"]).toContain(
      "node ./assert-interview-scheduling-concurrency.mjs",
    );
  });
});
