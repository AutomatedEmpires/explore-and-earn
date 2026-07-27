import { describe, expect, it } from "vitest";

/**
 * The DB-connected authorization suites write fixture rows and soft-delete a
 * seeker profile before rolling back. Until this guard existed, the only thing
 * deciding whether that happened against a local database or against production
 * was whichever DATABASE_URL was in the shell — and because everything rolls
 * back, a run against production would have printed "PASSED" and left nothing
 * behind to notice.
 *
 * The guard is exercised here rather than only in the runner because a
 * host-classification bug is silent in exactly the direction that matters: a
 * too-generous rule still passes every local run.
 */

// tools/db-assert has no build step and no types; it is plain ESM by design so
// the suites carry no dependencies.
const runSql = (await import("../../../tools/db-assert/run-sql.mjs")) as unknown as {
  resolveTargetHost: (env: Record<string, string | undefined>) => {
    host: string;
    source: string;
  };
  isLocalHost: (host: string) => boolean;
  assertLocalTarget: (env: Record<string, string | undefined>) => string;
};

const { assertLocalTarget, isLocalHost, resolveTargetHost } = runSql;

describe("db-assert refuses a non-local database", () => {
  it("accepts the shapes CI and local development actually use", () => {
    expect(
      assertLocalTarget({ PGHOST: "127.0.0.1", PGUSER: "postgres" }),
    ).toBe("127.0.0.1");
    // The password is deliberately short. What this case adds over the one below
    // is the user:pass@host parse shape, not the credential itself — and the ae
    // pre-push secret backstop blocks any postgres URI carrying a 6-character-or
    // -longer password, including the local `postgres:postgres` default. Restoring
    // the realistic password would block every push from this repo.
    expect(
      assertLocalTarget({
        DATABASE_URL: "postgresql://postgres:pg@127.0.0.1:54322/postgres",
      }),
    ).toBe("127.0.0.1");
    expect(
      assertLocalTarget({ DATABASE_URL: "postgresql://postgres@localhost:54322/postgres" }),
    ).toBe("localhost");
    // No host at all is libpq's local UNIX socket.
    expect(assertLocalTarget({})).toBe("");
  });

  it("refuses a managed Postgres host", () => {
    // Deliberately a fictional project ref and no password. The guard under test
    // decides on the HOST, so a credential here would prove nothing extra — and a
    // real-looking Postgres URI aimed at the production ref is exactly what the
    // repo's secret scanner blocks on push, which is how this test first failed.
    expect(() =>
      assertLocalTarget({
        DATABASE_URL:
          "postgresql://postgres@db.exampleprojectref.supabase.co:5432/postgres",
      }),
    ).toThrow(/refusing to run against a non-local database/);
    expect(() =>
      assertLocalTarget({
        DATABASE_URL:
          "postgresql://postgres@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("refuses a remote host supplied through the libpq variables", () => {
    expect(() =>
      assertLocalTarget({ PGHOST: "db.example.com", PGUSER: "postgres" }),
    ).toThrow(/PGHOST/);
  });

  it("does not mistake another machine on the LAN for this one", () => {
    // The near-miss cases. A private address is still a different computer,
    // and a hostname is not local because it contains the word.
    for (const host of [
      "10.0.0.5",
      "192.168.1.20",
      "172.16.4.4",
      "localhost.evil.example",
      "notlocalhost",
      "127.0.0.1.evil.example",
      "0.0.0.0",
    ]) {
      expect(isLocalHost(host), `${host} must not count as local`).toBe(false);
    }
  });

  it("accepts every genuine loopback form", () => {
    for (const host of [
      "",
      "127.0.0.1",
      "127.0.0.53",
      "::1",
      "[::1]",
      "LOCALHOST",
      "db.localhost",
      "/var/run/postgresql",
    ]) {
      expect(isLocalHost(host), `${host} is local`).toBe(true);
    }
  });

  it("reads the connection string in the same order libpq does", () => {
    // DATABASE_URL wins over SUPABASE_DB_URL, and both win over PGHOST, so the
    // guard inspects the host psql will really connect to.
    expect(
      resolveTargetHost({
        DATABASE_URL: "postgresql://u@db.example.com/postgres",
        SUPABASE_DB_URL: "postgresql://u@127.0.0.1/postgres",
        PGHOST: "127.0.0.1",
      }),
    ).toEqual({ host: "db.example.com", source: "DATABASE_URL" });
    expect(
      resolveTargetHost({
        SUPABASE_DB_URL: "postgresql://u@db.example.com/postgres",
        PGHOST: "127.0.0.1",
      }),
    ).toEqual({ host: "db.example.com", source: "SUPABASE_DB_URL" });
  });

  it("refuses rather than guesses when the connection string is unparseable", () => {
    expect(() => assertLocalTarget({ DATABASE_URL: "not a url" })).toThrow(
      /refusing to run against a non-local database/,
    );
  });
});
