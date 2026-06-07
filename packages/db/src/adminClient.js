import { createClient } from "@supabase/supabase-js";
/**
 * Resolve a required environment variable or throw. Mirrors the private helper
 * in client.ts (kept local so adminClient stays self-contained and the secret
 * service-role path never depends on the anon client module).
 */
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
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
export function adminClient(serviceRoleKey) {
    const key = serviceRoleKey || requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
