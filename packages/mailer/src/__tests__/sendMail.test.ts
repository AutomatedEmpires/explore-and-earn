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
    expect(result.isDuplicate).toBeFalsy();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[mailer:dev\].*dev@example\.com.*Hello/s),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns ok:false in production when RESEND_API_KEY is not set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendMail({
      to: "prod@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/RESEND_API_KEY/);
    expect(errorSpy).toHaveBeenCalled();
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
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("Test subject");
    expect(body).not.toHaveProperty("reply_to");
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
    expect(result.error).toBe("Network timeout");
    expect(errorSpy).toHaveBeenCalled();
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
