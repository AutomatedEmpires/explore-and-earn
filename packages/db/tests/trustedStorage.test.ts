import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({
    storage: { from: storageMocks.from },
  }),
}));

import {
  deleteTrustedListingMedia,
  listTrustedListingMedia,
  replaceTrustedListingMedia,
  uploadTrustedListingMedia,
} from "../src/trustedStorage";

const VALID_PATH =
  "host-id/library/housing/sleeping_area/00000000-0000-0000-0000-000000000001.webp";

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.from.mockReturnValue({
    upload: storageMocks.upload,
    remove: storageMocks.remove,
    list: storageMocks.list,
    getPublicUrl: storageMocks.getPublicUrl,
  });
  storageMocks.upload.mockResolvedValue({ error: null });
  storageMocks.remove.mockResolvedValue({ error: null });
  storageMocks.list.mockResolvedValue({ data: [], error: null });
  storageMocks.getPublicUrl.mockReturnValue({
    data: {
      publicUrl:
        "https://project.supabase.co/storage/v1/object/public/listing-media/" +
        VALID_PATH,
    },
  });
});

describe("uploadTrustedListingMedia", () => {
  it("writes prepared WebP bytes through the service-role Storage boundary", async () => {
    const bytes = new Uint8Array([82, 73, 70, 70]);

    await expect(
      uploadTrustedListingMedia({
        path: VALID_PATH,
        bytes,
        contentType: "image/webp",
      }),
    ).resolves.toContain(VALID_PATH);

    expect(storageMocks.from).toHaveBeenNthCalledWith(1, "listing-media");
    expect(storageMocks.upload).toHaveBeenCalledWith(VALID_PATH, bytes, {
      upsert: false,
      cacheControl: "31536000",
      contentType: "image/webp",
    });
    expect(storageMocks.from).toHaveBeenNthCalledWith(2, "listing-media");
    expect(storageMocks.getPublicUrl).toHaveBeenCalledWith(VALID_PATH);
  });

  it.each([
    "",
    "/leading.webp",
    "trailing.webp/",
    "host//photo.webp",
    "host/../photo.webp",
    "host\\photo.webp",
    "host/photo.webp\u0000",
  ])("rejects unsafe object path %j before opening Storage", async (path) => {
    await expect(
      uploadTrustedListingMedia({
        path,
        bytes: new Uint8Array([1]),
        contentType: "image/webp",
      }),
    ).rejects.toThrow("Invalid listing-media object path");
    expect(storageMocks.from).not.toHaveBeenCalled();
  });

  it.each([new Uint8Array(), new Uint8Array(5 * 1024 * 1024 + 1)])(
    "rejects empty and oversized prepared objects before opening Storage",
    async (bytes) => {
      await expect(
        uploadTrustedListingMedia({
          path: VALID_PATH,
          bytes,
          contentType: "image/webp",
        }),
      ).rejects.toThrow("exceeds the allowed size");
      expect(storageMocks.from).not.toHaveBeenCalled();
    },
  );

  it("surfaces a Storage upload failure without returning a public URL", async () => {
    storageMocks.upload.mockResolvedValueOnce({ error: { message: "storage unavailable" } });

    await expect(
      uploadTrustedListingMedia({
        path: VALID_PATH,
        bytes: new Uint8Array([1]),
        contentType: "image/webp",
      }),
    ).rejects.toThrow("storage unavailable");
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled();
  });

  it("retains the separate 5 MiB normalized-output allowance", async () => {
    const normalizedOutput = new Uint8Array(4 * 1024 * 1024 + 1);

    await expect(
      uploadTrustedListingMedia({
        path: VALID_PATH,
        bytes: normalizedOutput,
        contentType: "image/webp",
      }),
    ).resolves.toContain(VALID_PATH);
    const uploadCall = storageMocks.upload.mock.calls[0];
    expect(uploadCall?.[0]).toBe(VALID_PATH);
    expect(uploadCall?.[1]).toBe(normalizedOutput);
  });
});

describe("replaceTrustedListingMedia", () => {
  it("overwrites a deterministic normalized Meals slot with short-lived caching", async () => {
    const path = "host-id/benefit/listing-id/meals/kitchen";
    const bytes = new Uint8Array([82, 73, 70, 70]);

    await replaceTrustedListingMedia({
      path,
      bytes,
      contentType: "image/webp",
    });

    expect(storageMocks.upload).toHaveBeenCalledWith(path, bytes, {
      upsert: true,
      cacheControl: "3600",
      contentType: "image/webp",
    });
    expect(storageMocks.getPublicUrl).toHaveBeenCalledWith(path);
  });
});

describe("deleteTrustedListingMedia", () => {
  it("removes only the validated exact path", async () => {
    await expect(deleteTrustedListingMedia(VALID_PATH)).resolves.toBeUndefined();
    expect(storageMocks.from).toHaveBeenCalledWith("listing-media");
    expect(storageMocks.remove).toHaveBeenCalledWith([VALID_PATH]);
  });
});

describe("listTrustedListingMedia", () => {
  it("returns bounded object paths and creation timestamps for a slot prefix", async () => {
    storageMocks.list.mockResolvedValueOnce({
      data: [
        {
          name: "00000000-0000-4000-8000-000000000001.webp",
          created_at: "2026-07-20T12:00:00.000Z",
        },
        {
          name: "00000000-0000-4000-8000-000000000002.webp",
          created_at: null,
        },
      ],
      error: null,
    });

    await expect(
      listTrustedListingMedia("host-id/benefit/listing-id/housing/bathroom", 5),
    ).resolves.toEqual([
      {
        path:
          "host-id/benefit/listing-id/housing/bathroom/" +
          "00000000-0000-4000-8000-000000000001.webp",
        createdAt: "2026-07-20T12:00:00.000Z",
      },
      {
        path:
          "host-id/benefit/listing-id/housing/bathroom/" +
          "00000000-0000-4000-8000-000000000002.webp",
        createdAt: null,
      },
    ]);
    expect(storageMocks.list).toHaveBeenCalledWith(
      "host-id/benefit/listing-id/housing/bathroom",
      {
        limit: 5,
        offset: 0,
        sortBy: { column: "created_at", order: "asc" },
      },
    );
  });

  it.each([0, 101, 1.5])("rejects an invalid list limit %s", async (limit) => {
    await expect(
      listTrustedListingMedia("host-id/benefit/listing-id/housing/bathroom", limit),
    ).rejects.toThrow("list limit must be between 1 and 100");
    expect(storageMocks.from).not.toHaveBeenCalled();
  });

  it("surfaces Storage list failures", async () => {
    storageMocks.list.mockResolvedValueOnce({
      data: null,
      error: { message: "storage unavailable" },
    });

    await expect(
      listTrustedListingMedia("host-id/benefit/listing-id/housing/bathroom"),
    ).rejects.toThrow("storage unavailable");
  });
});
