export interface DatabaseClientConfig {
  readonly connectionString?: string;
  readonly role?: "service" | "request";
}

export function createDatabaseClient(config: DatabaseClientConfig = {}) {
  // TODO: Replace with the approved Supabase/Postgres client wrapper after the
  // local Supabase scaffold and RLS plan are implemented.
  return {
    kind: "placeholder-db-client" as const,
    config
  };
}