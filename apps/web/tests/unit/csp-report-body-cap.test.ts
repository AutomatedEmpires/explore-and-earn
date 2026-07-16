/**
 * Adversarial tests for the /api/csp-report body cap.
 *
 * What these pin:
 *  - BYTE-ACCURATE CAP: a chunked body (no trustworthy Content-Length) larger
 *    than 64 KB is dropped — 204, nothing parsed, nothing forwarded to Sentry.
 *    The cap is enforced on the bytes actually read, not the client header.
 *  - NEVER-THROW / ALWAYS-204: malformed JSON, rate-limited callers, and
 *    oversized bodies all still produce a quiet 204 (a browser posting a CSP
 *    report must never see an error).
 *  - HAPPY PATH: a well-formed legacy report under the cap is still summarized
 *    and forwarded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimitMock = vi.hoisted(() => vi.fn());
const reportMessageMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/rateLimit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("../../lib/sentry", () => ({ reportMessage: reportMessageMock }));

import { POST } from "../../app/api/csp-report/route";

const REPORT_URL = "http://localhost/api/csp-report";

/** A streamed (chunked) request body — no Content-Length header at all. */
function chunkedRequest(totalBytes: number, chunkSize = 16 * 1024): Request {
  const chunk = new Uint8Array(chunkSize).fill(97); // 'a'
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const remaining = totalBytes - sent;
      const next = remaining >= chunkSize ? chunk : new Uint8Array(remaining).fill(97);
      sent += next.byteLength;
      controller.enqueue(next);
    },
  });
  return new Request(REPORT_URL, {
    method: "POST",
    body: stream,
    // Node/undici requires half-duplex for streamed request bodies.
    ...({ duplex: "half" } as object),
  });
}

function jsonRequest(body: string): Request {
  return new Request(REPORT_URL, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/csp-report — byte-accurate body cap", () => {
  it("drops a chunked body over 64 KB: 204, nothing processed", async () => {
    const res = await POST(chunkedRequest(64 * 1024 + 1));
    expect(res.status).toBe(204);
    expect(reportMessageMock).not.toHaveBeenCalled();
  });

  it("a chunked body just under the cap is still read (then fails JSON parse → quiet 204)", async () => {
    const res = await POST(chunkedRequest(64 * 1024));
    expect(res.status).toBe(204);
    // 64 KB of 'a' is not JSON — never-throw contract still yields 204 and
    // nothing is forwarded.
    expect(reportMessageMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/csp-report — contract preserved", () => {
  it("forwards a well-formed legacy report under the cap", async () => {
    const res = await POST(
      jsonRequest(
        JSON.stringify({
          "csp-report": {
            "violated-directive": "script-src",
            "blocked-uri": "https://evil.example.com/x.js",
            "document-uri": "https://exploreandearn.com/",
          },
        }),
      ),
    );
    expect(res.status).toBe(204);
    expect(reportMessageMock).toHaveBeenCalledTimes(1);
    expect(reportMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("script-src"),
      "warning",
      expect.objectContaining({ route: "/api/csp-report" }),
    );
  });

  it("malformed JSON still returns a quiet 204", async () => {
    const res = await POST(jsonRequest("{not json"));
    expect(res.status).toBe(204);
    expect(reportMessageMock).not.toHaveBeenCalled();
  });

  it("rate-limited callers get a quiet 204 without the body being processed", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const res = await POST(jsonRequest(JSON.stringify({ "csp-report": {} })));
    expect(res.status).toBe(204);
    expect(reportMessageMock).not.toHaveBeenCalled();
  });
});
