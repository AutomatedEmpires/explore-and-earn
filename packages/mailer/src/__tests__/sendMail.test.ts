import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { _resetDedup, hashIdempotencyKey, sendMail } from "../index.js";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_FROM_EMAIL", "");
  vi.stubEnv("RESEND_REPLY_TO_EMAIL", "");
  _resetDedup();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  _resetDedup();
  vi.useRealTimers();
});

describe("sendMail", () => {
  it("logs to console in dev (no API key) and returns ok:true", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendMail({
      to: "dev@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result.ok).toBe(true);
    expect(result.providerRequestStarted).toBe(false);
    expect(result.isDuplicate).toBeFalsy();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[mailer:dev\].*dev@example\.com.*Hello/s),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns ok:false in production when RESEND_API_KEY is not set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const beforeProviderRequest = vi.fn(async () => ({ actionable: true as const }));
    const result = await sendMail({
      to: "prod@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      beforeProviderRequest,
    });

    expect(result.ok).toBe(false);
    expect(result.providerRequestStarted).toBe(false);
    expect(result.error).toMatch(/RESEND_API_KEY/);
    expect(errorSpy).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(beforeProviderRequest).not.toHaveBeenCalled();
  });

  it("checks durable authority immediately before the provider fetch", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const order: string[] = [];
    mockFetch.mockImplementation(async () => {
      order.push("fetch");
      return { ok: true, status: 200, json: async () => ({ id: "mail-1" }) };
    });

    const result = await sendMail({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      beforeProviderRequest: async () => {
        order.push("boundary");
        return { actionable: true };
      },
    });

    expect(result.ok).toBe(true);
    expect(order).toEqual(["boundary", "fetch"]);
  });

  it("cancels before fetch or reports unavailable boundary without pretending a send", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");

    const cancelled = await sendMail({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      beforeProviderRequest: async () => ({
        actionable: false,
        reason: "invite no longer actionable",
      }),
    });
    expect(cancelled).toEqual(
      expect.objectContaining({
        ok: false,
        cancelledReason: "invite no longer actionable",
        providerRequestStarted: false,
      }),
    );

    const unavailable = await sendMail({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      beforeProviderRequest: async () => {
        throw new Error("authority unavailable");
      },
    });
    expect(unavailable).toEqual(
      expect.objectContaining({
        ok: false,
        providerBoundaryUnavailable: true,
        providerRequestStarted: false,
      }),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns ok:false when recipient address is empty", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");

    const result = await sendMail({
      to: "   ",
      subject: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result.ok).toBe(false);
    expect(result.providerRequestStarted).toBe(false);
    expect(result.error).toContain("recipient");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends successfully and returns ok:true", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });

    const result = await sendMail({
      to: "user@example.com",
      subject: "Test subject",
      html: "<p>Test</p>",
    });

    expect(result.ok).toBe(true);
    expect(result.providerRequestStarted).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("Test subject");
    expect(body).not.toHaveProperty("reply_to");
  });

  it("preserves the exact RFC 8058 header pair in the Resend JSON payload", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });
    const headers = {
      "List-Unsubscribe":
        "<https://exploreandearn.com/api/notifications/unsubscribe?token=signed.token>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    } as const;

    await sendMail({
      to: "user@example.com",
      subject: "Opportunity digest",
      html: "<p>Digest</p>",
      headers,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.headers).toEqual(headers);
  });

  it("uses RESEND_FROM_EMAIL override when set", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "custom@myapp.com");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });

    await sendMail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.from).toBe("custom@myapp.com");
  });

  it("uses RESEND_REPLY_TO_EMAIL when set", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_REPLY_TO_EMAIL", " support@exploreandearn.com ");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });

    await sendMail({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.reply_to).toBe("support@exploreandearn.com");
  });

  it("catches provider HTTP errors and returns ok:false without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Validation error",
    });

    const result = await sendMail({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result.ok).toBe(false);
    expect(result.providerRequestStarted).toBe(true);
    expect(result.error).toContain("422");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("catches fetch network errors and returns ok:false without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error("Network timeout"));

    const result = await sendMail({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result.ok).toBe(false);
    expect(result.providerRequestStarted).toBe(true);
    expect(result.error).toBe("Network timeout");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("aborts a provider fetch inside the bounded mutation window", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockImplementation(
      async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );

    const pending = sendMail({
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
    });
    await vi.advanceTimersByTimeAsync(25_000);

    await expect(pending).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        error: "aborted",
        providerRequestStarted: true,
      }),
    );
  });

  it("deduplicates sends with the same idempotencyKey within the TTL", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });

    const opts = {
      to: "user@example.com",
      subject: "Offer!",
      html: "<p>Offer</p>",
      idempotencyKey: "applicationStatus:app-1:offered",
    };

    const first = await sendMail(opts);
    expect(first.ok).toBe(true);
    expect(first.isDuplicate).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledOnce();

    // Second call with same key should be a no-op.
    const second = await sendMail(opts);
    expect(second.ok).toBe(true);
    expect(second.isDuplicate).toBe(true);
    // Resend should NOT have been called a second time.
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("never mistakes an in-flight claim for a confirmed duplicate send", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    let enterBoundary!: () => void;
    const boundaryEntered = new Promise<void>((resolve) => {
      enterBoundary = resolve;
    });
    let releaseBoundary!: () => void;
    const boundaryGate = new Promise<void>((resolve) => {
      releaseBoundary = resolve;
    });
    const opts = {
      to: "user@example.com",
      subject: "Invitation",
      html: "<p>Invitation</p>",
      idempotencyKey: "invite:pending-boundary",
    };
    const first = sendMail({
      ...opts,
      beforeProviderRequest: async () => {
        enterBoundary();
        await boundaryGate;
        return { actionable: true };
      },
    });
    await boundaryEntered;

    const secondBoundary = vi.fn(async () => ({ actionable: true as const }));
    await expect(
      sendMail({ ...opts, beforeProviderRequest: secondBoundary }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        providerRequestStarted: false,
        error: expect.stringContaining("already in progress"),
      }),
    );
    expect(secondBoundary).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();

    releaseBoundary();
    await expect(first).resolves.toMatchObject({
      ok: true,
      providerRequestStarted: true,
    });
    expect(mockFetch).toHaveBeenCalledOnce();

    const duplicateBoundary = vi.fn(async () => ({
      actionable: false as const,
      reason: "invite withdrawn",
    }));
    await expect(
      sendMail({ ...opts, beforeProviderRequest: duplicateBoundary }),
    ).resolves.toMatchObject({
      ok: true,
      isDuplicate: true,
      providerRequestStarted: false,
    });
    expect(duplicateBoundary).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("re-sends after the idempotency TTL has expired", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });
    vi.useFakeTimers();

    const opts = {
      to: "user@example.com",
      subject: "Status update",
      html: "<p>Update</p>",
      idempotencyKey: "applicationStatus:app-2:reviewing",
    };

    const first = await sendMail(opts);
    expect(first.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    // Advance past the 5-minute TTL.
    vi.advanceTimersByTime(6 * 60 * 1000);

    const second = await sendMail(opts);
    expect(second.isDuplicate).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("different idempotency keys send independently", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });

    await sendMail({
      to: "user@example.com",
      subject: "A",
      html: "<p>A</p>",
      idempotencyKey: "key:A",
    });
    await sendMail({
      to: "user@example.com",
      subject: "B",
      html: "<p>B</p>",
      idempotencyKey: "key:B",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("provider-side idempotency header", () => {
  it("sends a hashed Idempotency-Key header when a key is provided", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });

    await sendMail({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      // Engine dedup keys carry U+241F separators, which HTTP header values
      // cannot — the transport must hash to an ASCII form.
      idempotencyKey: "evt-1␟clerk_host␟applications␟email␟default",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const headerValue = headers["Idempotency-Key"];
    expect(headerValue).toBe(
      hashIdempotencyKey("evt-1␟clerk_host␟applications␟email␟default"),
    );
    // sha-256 hex: deterministic, 64 ASCII chars.
    expect(headerValue).toMatch(/^[0-9a-f]{64}$/);
  });

  it("omits the header when no idempotency key is provided", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mockFetch.mockResolvedValue({ ok: true, text: async () => "" });

    await sendMail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Idempotency-Key");
  });
});
