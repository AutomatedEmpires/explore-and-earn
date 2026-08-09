import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import type { Notification } from "@explore-and-earn/db";
import { describe, expect, it } from "vitest";

import { toNotificationItem } from "../../components/notifications/notificationItems";
import {
  isSafeDestinationPath,
  normalizeNotificationActionUrl,
} from "../../lib/notifications/actionUrl";

describe("normalizeNotificationActionUrl", () => {
  it.each([
    ["/", "/"],
    ["/applied", "/applied"],
    ["/applied?tab=active#offer", "/applied?tab=active#offer"],
    ["/a/../saved?from=notification#top", "/saved?from=notification#top"],
    ["/search?q=two words", "/search?q=two%20words"],
    ["/" + "a".repeat(2047), "/" + "a".repeat(2047)],
  ] as const)("normalizes %s to a same-app destination", (raw, expected) => {
    expect(normalizeNotificationActionUrl(raw)).toBe(expected);
    expect(isSafeDestinationPath(raw)).toBe(true);
  });

  it.each([
    null,
    undefined,
    42,
    {},
    "",
    "   ",
    "applied",
    "https://evil.example/path",
    "javascript:alert(1)",
    "//evil.example/path",
    "///evil.example/path",
    "/\\evil.example/path",
    "/path\\segment",
    "/https://evil.example",
    "/javascript:alert(1)",
    "/%6aavascript%3Aalert(1)",
    "/a/..//evil.example",
    "/a/%2e%2e//evil.example",
    "/%2f%2fevil.example",
    "/%zz",
    "/trailing ",
    "/" + "a".repeat(2048),
  ])("rejects unsafe or ambiguous input %#", (raw) => {
    expect(normalizeNotificationActionUrl(raw)).toBeNull();
  });

  it("rejects every literal ASCII control character", () => {
    const controls = [
      ...Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)),
      String.fromCharCode(127),
    ];

    for (const control of controls) {
      expect(normalizeNotificationActionUrl(`/safe${control}path`)).toBeNull();
    }
  });
});

describe("persisted notification adapter", () => {
  function notification(actionUrl: string | null): Notification {
    return {
      id: "notification-1",
      category: "system",
      priority: "informational",
      channel: "in_app",
      title: "Account update",
      body: "Your account was updated.",
      eventId: null,
      subjectType: null,
      subjectId: null,
      actionUrl,
      readAt: null,
      dismissedAt: null,
      createdAt: "2026-08-09T12:00:00.000Z",
    };
  }

  it("emits only a normalized actionHref, with explicit null otherwise", () => {
    expect(toNotificationItem(notification("/a/../saved?tab=all")).actionHref).toBe(
      "/saved?tab=all",
    );
    expect(toNotificationItem(notification("/a/..//evil.example")).actionHref).toBeNull();
    expect(toNotificationItem(notification(null)).actionHref).toBeNull();
  });
});

describe("service worker notification destination guard", () => {
  const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  const sandbox: {
    self: { addEventListener: () => undefined };
    URL: typeof URL;
    safeNotificationPath?: (path: unknown) => string;
  } = {
    self: {
      addEventListener: () => undefined,
    },
    URL,
  };

  runInNewContext(source, sandbox);
  const safeNotificationPath = sandbox.safeNotificationPath;

  it("executes the shipped worker guard against parser-driven escapes", () => {
    expect(safeNotificationPath).toBeTypeOf("function");
    expect(safeNotificationPath?.("/\t/evil.example")).toBe("/");
    expect(safeNotificationPath?.("/a/..//evil.example")).toBe("/");
    expect(safeNotificationPath?.("/saved?tab=all#latest")).toBe(
      "/saved?tab=all#latest",
    );
  });
});
