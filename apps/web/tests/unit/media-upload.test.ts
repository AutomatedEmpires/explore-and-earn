import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { prepareUploadImage, validateUploadFile } from "../../services/media";

describe("prepareUploadImage", () => {
  it("keeps raw Server Action input at 4 MiB while reporting the limit truthfully", () => {
    expect(
      validateUploadFile(
        new File([new Uint8Array(4 * 1024 * 1024)], "boundary.webp", {
          type: "image/webp",
        }),
      ),
    ).toEqual({ ok: true });
    expect(
      validateUploadFile(
        new File([new Uint8Array(4 * 1024 * 1024 + 1)], "too-large.webp", {
          type: "image/webp",
        }),
      ),
    ).toEqual({ ok: false, error: "Images must be 4 MB or smaller." });
  });

  it("applies orientation and emits a metadata-free bounded WebP", async () => {
    const jpeg = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: { r: 30, g: 100, b: 180 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await prepareUploadImage(
      new File([new Uint8Array(jpeg)], "oriented.jpg", { type: "image/jpeg" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.contentType).toBe("image/webp");
    expect(result.image.bytes.byteLength).toBeGreaterThan(0);
    expect(result.image.bytes.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);

    const metadata = await sharp(result.image.bytes).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(20);
    expect(metadata.height).toBe(40);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it("rejects caller-declared image MIME when the bytes are not an image", async () => {
    const result = await prepareUploadImage(
      new File(["this is not a jpeg"], "spoofed.jpg", { type: "image/jpeg" }),
    );

    expect(result).toEqual({
      ok: false,
      error:
        "This image could not be safely processed. Try a smaller JPEG, PNG, WebP, or HEIC.",
    });
  });

  it("rejects a decoded format outside the allow-list even with a forged MIME", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    const result = await prepareUploadImage(
      new File([svg], "spoofed.jpg", { type: "image/jpeg" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Please choose a valid, non-animated image.",
    });
  });

  it("enforces the decoded pixel ceiling before re-encoding", async () => {
    const png = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: "white",
      },
    })
      .png()
      .toBuffer();

    const result = await prepareUploadImage(
      new File([new Uint8Array(png)], "pixels.png", { type: "image/png" }),
      { maxInputPixels: 100 },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("could not be safely processed");
  });
});
