/**
 * Unit tests for packages/db/src/queries/reports.ts
 *
 * These tests validate the input-validation guards in insertReport WITHOUT
 * hitting a real database. The Supabase client is mocked via vi.mock so no
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY env vars are needed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// "server-only" is a Node-only marker package that throws if imported outside
// a server context. Replace it with a no-op so unit tests can import reports.ts.
vi.mock("server-only", () => ({}));

// Mock authedClient so we can intercept Supabase calls without env vars.
let mockInsertResult: { data: unknown; error: unknown } = {
  data: null,
  error: { message: "default mock" },
};

vi.mock("../src/client", () => ({
  authedClient: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => mockInsertResult,
        }),
      }),
    }),
  }),
}));

// ---------------------------------------------------------------------------
// Import subject under test AFTER mocks are registered
// ---------------------------------------------------------------------------
const { insertReport } = await import("../src/queries/reports");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMockSuccess() {
  mockInsertResult = {
    data: {
      id: "00000000-0000-0000-0000-000000000001",
      reporter_id: "user_clerk123",
      listing_id: "00000000-0000-0000-0000-000000000002",
      reason: "scam",
      detail: "Extra detail",
      status: "submitted",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  };
}

function makeToken() {
  return "fake-clerk-jwt";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("insertReport — input validation", () => {
  afterEach(() => {
    // Reset to a failing state between tests to prevent accidental pass-through.
    mockInsertResult = { data: null, error: { message: "mock reset" } };
  });

  it("returns error when reporterId is empty", async () => {
    const result = await insertReport(makeToken(), {
      reporterId: "",
      listingId: "00000000-0000-0000-0000-000000000002",
      reason: "scam",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/reporter id/i);
    }
  });

  it("returns error when listingId is empty", async () => {
    const result = await insertReport(makeToken(), {
      reporterId: "user_clerk123",
      listingId: "",
      reason: "scam",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/listing id/i);
    }
  });

  it("returns error for an invalid reason", async () => {
    const result = await insertReport(makeToken(), {
      reporterId: "user_clerk123",
      listingId: "00000000-0000-0000-0000-000000000002",
      // @ts-expect-error — intentionally invalid
      reason: "bad_reason",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/invalid report reason/i);
    }
  });

  it("accepts all valid reasons without a validation error", async () => {
    const validReasons = [
      "unsafe",
      "inaccurate",
      "scam",
      "inappropriate",
      "housing_pay",
      "other",
    ] as const;

    for (const reason of validReasons) {
      makeMockSuccess();
      const result = await insertReport(makeToken(), {
        reporterId: "user_clerk123",
        listingId: "00000000-0000-0000-0000-000000000002",
        reason,
      });
      expect(result.ok, `reason "${reason}" should be accepted`).toBe(true);
    }
  });
});

describe("insertReport — success path", () => {
  it("maps the returned row to InsertedReport correctly", async () => {
    makeMockSuccess();
    const result = await insertReport(makeToken(), {
      reporterId: "user_clerk123",
      listingId: "00000000-0000-0000-0000-000000000002",
      reason: "scam",
      detail: "Extra detail",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.id).toBe("00000000-0000-0000-0000-000000000001");
      expect(result.report.reporterId).toBe("user_clerk123");
      expect(result.report.listingId).toBe("00000000-0000-0000-0000-000000000002");
      expect(result.report.reason).toBe("scam");
      expect(result.report.detail).toBe("Extra detail");
      expect(result.report.status).toBe("submitted");
      expect(result.report.createdAt).toBe("2026-01-01T00:00:00.000Z");
    }
  });

  it("sets detail to null when detail is empty string", async () => {
    mockInsertResult = {
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        reporter_id: "user_clerk123",
        listing_id: "00000000-0000-0000-0000-000000000002",
        reason: "other",
        detail: null,
        status: "submitted",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    };

    const result = await insertReport(makeToken(), {
      reporterId: "user_clerk123",
      listingId: "00000000-0000-0000-0000-000000000002",
      reason: "other",
      detail: "   ", // whitespace-only → trimmed to null
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.detail).toBeNull();
    }
  });
});

describe("insertReport — database error path", () => {
  it("surfaces the Supabase error message", async () => {
    mockInsertResult = {
      data: null,
      error: { message: "foreign key violation" },
    };

    const result = await insertReport(makeToken(), {
      reporterId: "user_clerk123",
      listingId: "00000000-0000-0000-0000-000000000002",
      reason: "unsafe",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("foreign key violation");
    }
  });

  it("falls back to generic message when error has no message", async () => {
    mockInsertResult = { data: null, error: null }; // null error but null data

    const result = await insertReport(makeToken(), {
      reporterId: "user_clerk123",
      listingId: "00000000-0000-0000-0000-000000000002",
      reason: "unsafe",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/could not submit/i);
    }
  });
});
