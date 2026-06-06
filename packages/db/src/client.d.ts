import { type SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedDatabase } from "./types.gen";
export declare function anonClient(): SupabaseClient<GeneratedDatabase>;
export declare function authedClient(clerkToken: string): SupabaseClient<GeneratedDatabase>;
