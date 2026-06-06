import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types.gen";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function supabaseConfig() {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function anonClient(): SupabaseClient<Database> {
  const { url, anonKey } = supabaseConfig();

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function authedClient(
  clerkToken: string,
): SupabaseClient<Database> {
  if (!clerkToken) {
    throw new Error("A Clerk JWT is required to create an authenticated Supabase client.");
  }

  const { url, anonKey } = supabaseConfig();

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${clerkToken}`,
      },
    },
  });
}
