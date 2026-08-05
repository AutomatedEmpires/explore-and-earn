import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "supabase",
    "migrations",
    "090_message_delivery_atomic.sql",
  ),
  "utf8",
);

describe("migration 090 atomic message delivery", () => {
  it("emits exactly one routing-only message event in the insert transaction", () => {
    expect(SQL).toMatch(
      /create unique index if not exists events_message_sent_message_id_unique[\s\S]*?event_type = 'message_sent'[\s\S]*?properties \? 'message_id'/i,
    );
    expect(SQL).toMatch(
      /create trigger trg_messages_emit_sent_event[\s\S]*?after insert on public\.messages[\s\S]*?emit_message_sent_event/i,
    );
    expect(SQL).toMatch(
      /insert into public\.events[\s\S]*?'message_sent'[\s\S]*?'conversation'[\s\S]*?'message_insert_trigger'/i,
    );
    expect(SQL).toMatch(/'sender_role', new\.sender_type/i);
    expect(SQL).toMatch(/'message_id', new\.id/i);
    expect(SQL).not.toMatch(/jsonb_build_object\([\s\S]*?'body'/i);
    expect(SQL).toMatch(
      /update public\.conversations c[\s\S]*?last_message_at = greatest\([\s\S]*?new\.created_at/i,
    );
  });

  it("validates even privileged message writers against the conversation", () => {
    expect(SQL).toMatch(
      /new\.sender_type = 'host'[\s\S]*?new\.sender_profile_id <> v_host_profile_id/i,
    );
    expect(SQL).toMatch(
      /new\.sender_type = 'seeker'[\s\S]*?new\.sender_profile_id <> v_seeker_profile_id/i,
    );
    expect(SQL).toContain("message_sender_mismatch");
    expect(SQL).toMatch(
      /create or replace function public\.emit_message_sent_event\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i,
    );
    expect(SQL).toMatch(
      /revoke execute on function public\.emit_message_sent_event\(\)[\s\S]*?from public, anon, authenticated, service_role/i,
    );
  });

  it("exposes one JWT-derived authenticated RPC and closes direct INSERT", () => {
    const rpcStart = SQL.indexOf(
      "create or replace function public.send_my_conversation_message",
    );
    const rpcEnd = SQL.indexOf("$$;", rpcStart) + 3;
    const rpc = SQL.slice(rpcStart, rpcEnd);

    expect(rpcStart).toBeGreaterThan(-1);
    expect(rpc).toMatch(/p_conversation_id uuid,\s*p_body text/i);
    expect(rpc).not.toMatch(/p_clerk_user_id|p_sender|p_(?:host|seeker)_profile_id/i);
    expect(rpc).toMatch(/v_clerk_user_id text := public\.get_clerk_user_id\(\)/i);
    expect(rpc).toMatch(/join public\.host_profiles h/i);
    expect(rpc).toMatch(/join public\.seeker_profiles s/i);
    expect(rpc).toMatch(/if v_host_clerk_user_id = v_clerk_user_id[\s\S]*?elsif v_seeker_clerk_user_id = v_clerk_user_id/i);
    expect(rpc).toMatch(/security definer[\s\S]*?set search_path = ''/i);
    expect(SQL).toMatch(
      /revoke insert on table public\.messages from public, anon, authenticated/i,
    );
    expect(SQL).toMatch(
      /revoke execute on function public\.send_my_conversation_message\(uuid, text\)[\s\S]*?from public, anon, authenticated, service_role[\s\S]*?grant execute[\s\S]*?to authenticated/i,
    );
  });

  it("keeps the canonical trimmed 1-to-4,000 character body contract", () => {
    expect(SQL).toMatch(/v_body text := btrim\(coalesce\(p_body, ''\)\)/i);
    expect(SQL).toMatch(/char_length\(v_body\) = 0[\s\S]*?message_body_empty/i);
    expect(SQL).toMatch(/char_length\(v_body\) > 4000[\s\S]*?message_body_too_long/i);
    expect(SQL).toMatch(
      /insert into public\.messages[\s\S]*?v_sender_role[\s\S]*?v_sender_profile_id[\s\S]*?v_body/i,
    );
    const rpc = SQL.slice(
      SQL.indexOf("create or replace function public.send_my_conversation_message"),
    );
    expect(rpc).not.toMatch(/update public\.conversations/i);
  });
});
