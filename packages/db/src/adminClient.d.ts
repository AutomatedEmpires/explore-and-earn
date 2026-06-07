import { type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
/**
 * Service-role Supabase client — ADMIN ONLY, SERVER ONLY.
 *
 * Unlike anonClient() / authedClient() (which talk to PostgREST as the `anon`
 * role and rely on RLS + app-level scoping), this client authenticates with the
 * Supabase SERVICE ROLE key and therefore BYPASSES Row Level Security entirely.
 * It exists so the founder admin panel can read and moderate every row across
 * the marketplace.
 *
 * SECURITY (do not weaken):
 *   - SUPABASE_SERVICE_ROLE_KEY is a server-only secret. It must NEVER be sent
 *     to the browser and must NEVER be prefixed with NEXT_PUBLIC_. Only import
 *     this module from server components / server actions.
 *   - Every caller must independently verify the request comes from an admin
 *     user (see the (admin) layout gate + the admin server-action guards).
 *
 * @param serviceRoleKey - Optional explicit service role key. Defaults to
 *   process.env.SUPABASE_SERVICE_ROLE_KEY. Accepting it as a parameter mirrors
 *   authedClient(clerkToken) and lets the server pass the secret explicitly
 *   while keeping the env var the single source of truth.
 */
export declare function adminClient(serviceRoleKey?: string): SupabaseClient<Database>;
