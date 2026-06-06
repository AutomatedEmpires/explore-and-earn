import { type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
export declare function anonClient(): SupabaseClient<Database>;
export declare function authedClient(clerkToken: string): SupabaseClient<Database>;
