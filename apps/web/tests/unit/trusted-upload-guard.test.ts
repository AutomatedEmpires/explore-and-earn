import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dbMocks = vi.hoisted(() => ({
  deleteTrustedListingMedia: vi.fn(),
  listTrustedListingMedia: vi.fn(),
}));
const checkRateLimitDistributedMock = vi.hoisted(() => vi.fn());

vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: checkRateLimitDistributedMock,
}));

import {
  guardTrustedUploadSlot,
  hasTrustedUploadBudget,
  TRUSTED_UPLOAD_ORPHAN_TTL_MS,
} from "../../services/media/trustedUploadGuard";

const PREFIX = "host-1/benefit/listing-1/housing/bathroom";
const NOW = Date.parse("2026-07-21T12:00:00.000Z");
const pathFor = (suffix: string) => `${PREFIX}/${suffix}`;
const oldObject = (suffix: string) => ({
  path: pathFor(suffix),
  createdAt: new Date(NOW - TRUSTED_UPLOAD_ORPHAN_TTL_MS - 1).toISOString(),
});
const recentObject = (suffix: string) => ({
  path: pathFor(suffix),
  createdAt: new Date(NOW - TRUSTED_UPLOAD_ORPHAN_TTL_MS + 1).toISOString(),
});

const UUID_A = "00000000-0000-4000-8000-000000000001.webp";
const UUID_B = "00000000-0000-4000-8000-000000000002.webp";
const UUID_C = "00000000-0000-4000-8000-000000000003.webp";
const UUID_D = "00000000-0000-4000-8000-000000000004.webp";

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitDistributedMock.mockResolvedValue({ allowed: true });
  dbMocks.deleteTrustedListingMedia.mockResolvedValue(undefined);
  dbMocks.listTrustedListingMedia.mockResolvedValue([]);
});

describe("hasTrustedUploadBudget", () => {
  it("uses the distributed per-user upload budget", async () => {
    await expect(hasTrustedUploadBudget("user-1")).resolves.toBe(true);
    expect(checkRateLimitDistributedMock).toHaveBeenCalledWith(
      "trusted-photo-upload:user-1",
      30,
      15 * 60 * 1000,
    );

    checkRateLimitDistributedMock.mockResolvedValueOnce({ allowed: false });
    await expect(hasTrustedUploadBudget("user-1")).resolves.toBe(false);
  });
});

describe("guardTrustedUploadSlot", () => {
  it("sweeps only expired, unreferenced action-generated objects", async () => {
    const referenced = oldObject(UUID_A);
    const expiredOrphan = oldObject(UUID_B);
    const recentOrphan = recentObject(UUID_C);
    const unknownLegacy = oldObject("legacy.webp");
    dbMocks.listTrustedListingMedia
      .mockResolvedValueOnce([
        referenced,
        expiredOrphan,
        recentOrphan,
        unknownLegacy,
      ])
      .mockResolvedValueOnce([referenced, recentOrphan, unknownLegacy]);

    await expect(
      guardTrustedUploadSlot({
        prefix: PREFIX,
        referencedPaths: new Set([referenced.path]),
        nowMs: NOW,
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledTimes(1);
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledWith(
      expiredOrphan.path,
    );
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalledWith(
      referenced.path,
    );
    expect(dbMocks.listTrustedListingMedia.mock.calls).toEqual([
      [PREFIX, 100],
      [PREFIX, 5],
    ]);
  });

  it("fails closed at the durable four-object slot allowance", async () => {
    const objects = [UUID_A, UUID_B, UUID_C, UUID_D].map(recentObject);
    dbMocks.listTrustedListingMedia
      .mockResolvedValueOnce(objects)
      .mockResolvedValueOnce(objects);

    await expect(
      guardTrustedUploadSlot({
        prefix: PREFIX,
        referencedPaths: new Set(),
        nowMs: NOW,
      }),
    ).resolves.toEqual({
      ok: false,
      error:
        "This photo slot has too many pending uploads. Try again after older uploads expire.",
    });
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalled();
  });

  it("counts failed cleanup attempts against capacity", async () => {
    const expired = [UUID_A, UUID_B, UUID_C, UUID_D].map(oldObject);
    dbMocks.listTrustedListingMedia
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(expired);
    dbMocks.deleteTrustedListingMedia.mockRejectedValue(
      new Error("concurrently referenced"),
    );

    const result = await guardTrustedUploadSlot({
      prefix: PREFIX,
      referencedPaths: new Set(),
      nowMs: NOW,
    });

    expect(result.ok).toBe(false);
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledTimes(4);
  });

  it("propagates inventory failures so callers can stop before decoding", async () => {
    dbMocks.listTrustedListingMedia.mockRejectedValueOnce(
      new Error("inventory unavailable"),
    );

    await expect(
      guardTrustedUploadSlot({
        prefix: PREFIX,
        referencedPaths: new Set(),
        nowMs: NOW,
      }),
    ).rejects.toThrow("inventory unavailable");
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalled();
  });
});
