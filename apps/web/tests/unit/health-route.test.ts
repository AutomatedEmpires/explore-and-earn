import { afterEach, describe, expect, it, vi } from "vitest";

const getPublicListingsMock = vi.hoisted(() => vi.fn());

vi.mock("@explore-and-earn/db", () => ({
  getPublicListings: getPublicListingsMock,
}));

const { GET } = await import("../../app/api/health/route");

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function responseBody(response: Response): Promise<unknown> {
  return response.json();
}

describe("GET /api/health", () => {
  it("reports ready only after the public discovery query succeeds", async () => {
    getPublicListingsMock.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(responseBody(response)).resolves.toEqual({
      status: "ready",
      checks: { database: "ok" },
    });
    expect(getPublicListingsMock).toHaveBeenCalledWith(
      1,
      expect.any(AbortSignal),
    );
  });

  it("reports a sanitized 503 when configuration throws synchronously", async () => {
    getPublicListingsMock.mockImplementation(() => {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL=fake-secret-url");
    });

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "not_ready",
      checks: { database: "unavailable" },
    });
    expect(JSON.stringify(body)).not.toContain("fake-secret-url");
  });

  it("does not expose rejected database details", async () => {
    getPublicListingsMock.mockRejectedValue(
      new Error("connection failed with fake-secret-key"),
    );

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "not_ready",
      checks: { database: "unavailable" },
    });
    expect(JSON.stringify(body)).not.toContain("fake-secret-key");
  });

  it("bounds a stalled dependency with an abort signal", async () => {
    const controller = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    getPublicListingsMock.mockImplementation(
      (_limit: number, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );

    const startedAt = performance.now();
    const responsePromise = GET();
    controller.abort();
    const response = await responsePromise;
    const elapsedMs = performance.now() - startedAt;

    expect(response.status).toBe(503);
    expect(timeoutSpy).toHaveBeenCalledWith(3_000);
    expect(elapsedMs).toBeLessThan(500);
  });
});
