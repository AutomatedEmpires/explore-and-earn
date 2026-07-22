import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_PREF,
  THEME_COOKIE_NAME,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  normalizeThemePref,
  resolveThemePref,
  themeHtmlAttr,
} from "../../lib/theme";

/**
 * The theme contract (lib/theme.ts) — the founder's 2026-07-22 requirements:
 *   1. The DEFAULT ENTRY is NOT forced-dark (it is Light; Dark/System opt-in).
 *   2. A chosen preference PERSISTS to both stores (localStorage + the cookie
 *      SSR reads), and the bootstrap honors + re-syncs it on the next load.
 * The no-flash bootstrap is executed for real (node:vm) against a stubbed DOM
 * so these assertions cover the actual shipped script, not a re-implementation.
 */

interface BootstrapWorld {
  readonly dataset: Record<string, string | undefined>;
  readonly style: Record<string, string | undefined>;
  readonly localStore: Map<string, string>;
  readonly cookieWrites: string[];
}

function runBootstrap(options: {
  stored?: Record<string, string>;
  cookie?: string;
  osPrefersDark?: boolean;
}): BootstrapWorld {
  const dataset: Record<string, string | undefined> = {};
  const style: Record<string, string | undefined> = {};
  const localStore = new Map<string, string>(Object.entries(options.stored ?? {}));
  const cookieWrites: string[] = [];

  const documentStub: { documentElement: unknown; cookie?: string } = {
    documentElement: { dataset, style },
  };
  Object.defineProperty(documentStub, "cookie", {
    get: () => options.cookie ?? "",
    set: (value: string) => {
      cookieWrites.push(value);
    },
  });

  const sandbox = {
    document: documentStub,
    localStorage: {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStore.set(key, value);
      },
    },
    window: {
      matchMedia: (query: string) => ({
        matches: query.includes("dark") && (options.osPrefersDark ?? false),
      }),
    },
  };

  runInNewContext(THEME_INIT_SCRIPT, sandbox);
  return { dataset, style, localStore, cookieWrites };
}

describe("theme default entry", () => {
  it("is not forced-dark (founder 2026-07-22: light by default)", () => {
    expect(DEFAULT_THEME_PREF).not.toBe("dark");
    expect(DEFAULT_THEME_PREF).toBe("light");
  });

  it("bootstrap resolves a first visit (nothing stored anywhere) to light", () => {
    const world = runBootstrap({});
    expect(world.dataset.theme).toBe("light");
    expect(world.style.colorScheme).toBe("light");
  });

  it("bootstrap does NOT resolve a first visit to dark even under an OS dark scheme", () => {
    // The default is an explicit Light entry, not System — an unstored visitor
    // on an OS-dark machine still lands on Light (System is one click away).
    const world = runBootstrap({ osPrefersDark: true });
    expect(world.dataset.theme).toBe("light");
  });

  it("bootstrap writes NOTHING for a first-time visitor (default is not an expressed preference)", () => {
    const world = runBootstrap({});
    expect(world.localStore.size).toBe(0);
    expect(world.cookieWrites).toEqual([]);
  });

  it("SSR emits the light attribute when no cookie preference exists", () => {
    expect(themeHtmlAttr(null)).toBe("light");
  });
});

describe("theme persistence round-trip", () => {
  it("bootstrap honors a stored dark preference", () => {
    const world = runBootstrap({ stored: { [THEME_STORAGE_KEY]: "dark" } });
    expect(world.dataset.theme).toBe("dark");
    expect(world.style.colorScheme).toBe("dark");
  });

  it("bootstrap honors a stored light preference under an OS dark scheme", () => {
    const world = runBootstrap({
      stored: { [THEME_STORAGE_KEY]: "light" },
      osPrefersDark: true,
    });
    expect(world.dataset.theme).toBe("light");
  });

  it("bootstrap resolves a stored system preference via the OS scheme", () => {
    const dark = runBootstrap({
      stored: { [THEME_STORAGE_KEY]: "system" },
      osPrefersDark: true,
    });
    expect(dark.dataset.theme).toBe("dark");

    const light = runBootstrap({
      stored: { [THEME_STORAGE_KEY]: "system" },
      osPrefersDark: false,
    });
    expect(light.dataset.theme).toBe("light");
  });

  it("bootstrap backfills the SSR cookie when only localStorage has the preference", () => {
    const world = runBootstrap({ stored: { [THEME_STORAGE_KEY]: "dark" } });
    expect(world.cookieWrites).toHaveLength(1);
    expect(world.cookieWrites[0]).toContain(`${THEME_COOKIE_NAME}=dark`);
    expect(world.cookieWrites[0]).toContain("path=/");
    expect(world.cookieWrites[0]).toContain("max-age=");
  });

  it("bootstrap backfills localStorage from the cookie (cookie-only client)", () => {
    const world = runBootstrap({ cookie: `${THEME_COOKIE_NAME}=dark` });
    expect(world.dataset.theme).toBe("dark");
    expect(world.localStore.get(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("bootstrap migrates the retired legacy 'auto' value to 'system' in both stores", () => {
    const world = runBootstrap({
      stored: { [THEME_STORAGE_KEY]: "auto" },
      osPrefersDark: true,
    });
    expect(world.dataset.theme).toBe("dark"); // system + OS dark
    expect(world.localStore.get(THEME_STORAGE_KEY)).toBe("system");
    expect(world.cookieWrites[0]).toContain(`${THEME_COOKIE_NAME}=system`);
  });

  it("bootstrap ignores an unrecognized stored value and falls back to the default", () => {
    const world = runBootstrap({ stored: { [THEME_STORAGE_KEY]: "midnight" } });
    expect(world.dataset.theme).toBe("light");
  });

  it("bootstrap still applies the accent palette pass", () => {
    const world = runBootstrap({ stored: { "ee-palette": "sunset" } });
    expect(world.dataset.palette).toBe("sunset");
    const glacier = runBootstrap({ stored: { "ee-palette": "glacier" } });
    expect(glacier.dataset.palette).toBeUndefined();
  });
});

describe("theme contract helpers", () => {
  it("normalizes stored values (legacy 'auto' -> 'system'; junk -> null)", () => {
    expect(normalizeThemePref("light")).toBe("light");
    expect(normalizeThemePref("dark")).toBe("dark");
    expect(normalizeThemePref("system")).toBe("system");
    expect(normalizeThemePref("auto")).toBe("system");
    expect(normalizeThemePref("midnight")).toBeNull();
    expect(normalizeThemePref(undefined)).toBeNull();
    expect(normalizeThemePref(null)).toBeNull();
  });

  it("resolves preferences against the OS scheme", () => {
    expect(resolveThemePref("light", true)).toBe("light");
    expect(resolveThemePref("dark", false)).toBe("dark");
    expect(resolveThemePref("system", true)).toBe("dark");
    expect(resolveThemePref("system", false)).toBe("light");
  });

  it("maps preferences to the SSR data-theme attribute", () => {
    expect(themeHtmlAttr("light")).toBe("light");
    expect(themeHtmlAttr("dark")).toBe("dark");
    // "system" omits the attribute so tokens.css's prefers-color-scheme block
    // paints the OS theme with zero JS.
    expect(themeHtmlAttr("system")).toBeUndefined();
  });
});
