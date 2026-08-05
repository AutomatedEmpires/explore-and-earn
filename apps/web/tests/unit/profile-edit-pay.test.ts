import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatPayCentsForInput,
  parsePayInput,
} from "../../app/[locale]/(seeker)/profile/edit/profilePay";

describe("seeker profile pay input", () => {
  it("loads stored cents with exact cent precision", () => {
    expect(formatPayCentsForInput(1_750)).toBe("17.50");
    expect(formatPayCentsForInput(1_701)).toBe("17.01");
    expect(formatPayCentsForInput(0)).toBe("0.00");
  });

  it("round-trips an unchanged stored value through an unrelated profile save", () => {
    const displayed = formatPayCentsForInput(1_750);

    expect(parsePayInput(displayed)).toEqual({ ok: true, cents: 1_750 });
  });

  it("keeps a cleared preference distinct from malformed or sub-cent input", () => {
    expect(formatPayCentsForInput(null)).toBe("");
    expect(parsePayInput("")).toEqual({ ok: true, cents: null });
    expect(parsePayInput("   ")).toEqual({ ok: true, cents: null });

    for (const invalid of ["-1", "17.005", "one", "Infinity", "1e3"]) {
      expect(parsePayInput(invalid)).toEqual({ ok: false });
    }
  });

  it("accepts whole-dollar, one-decimal, and two-decimal values", () => {
    expect(parsePayInput("17")).toEqual({ ok: true, cents: 1_700 });
    expect(parsePayInput("17.5")).toEqual({ ok: true, cents: 1_750 });
    expect(parsePayInput("17.50")).toEqual({ ok: true, cents: 1_750 });
    expect(parsePayInput("0.01")).toEqual({ ok: true, cents: 1 });
  });

  it("declares cent precision on both pay controls", () => {
    const form = readFileSync(
      resolve(
        process.cwd(),
        "app/[locale]/(seeker)/profile/edit/ProfileEditForm.tsx",
      ),
      "utf8",
    );

    expect(form.match(/step="0\.01"/g)).toHaveLength(2);
    expect(form.match(/inputMode="decimal"/g)).toHaveLength(2);
  });
});
