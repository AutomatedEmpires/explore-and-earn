import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Notification } from "@explore-and-earn/db";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { HOST_NAV_GROUPS } from "../../components/host/hostNav";
import {
  formatNotificationTimeAgo,
  toNotificationItem,
} from "../../components/notifications/notificationItems";
import { NotificationList } from "../../components/seeker/NotificationList";
import type { NotificationItem } from "../../components/seeker/account";

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) =>
  readFileSync(new URL(relative, webRoot), "utf8");
const exists = (relative: string) => existsSync(new URL(relative, webRoot));

function notification(
  overrides: Partial<Notification> = {},
): Notification {
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
    actionUrl: null,
    readAt: null,
    dismissedAt: null,
    createdAt: "2026-08-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("shared notification presentation", () => {
  it.each([
    ["applications", "application_status", "action.apply"],
    ["offers", "offer_received", "status.match"],
    ["invites", "invite_received", "action.message"],
    ["community", "community_reaction", "system.success"],
    ["scheduling", "interview", "system.info"],
    ["safety", "application_status", "system.warning"],
    ["verification", "application_status", "trust.verified_host"],
    ["billing", "application_status", "system.info"],
    ["refunds", "application_status", "system.info"],
    ["system", "application_status", "system.info"],
    ["future_category", "application_status", "system.info"],
  ] as const)(
    "maps %s to %s with %s",
    (category, expectedKind, expectedIcon) => {
      const item = toNotificationItem(
        notification({ category }),
        Date.parse("2026-08-05T12:01:00.000Z"),
      );

      expect(item.kind).toBe(expectedKind);
      expect(item.icon).toBe(expectedIcon);
    },
  );

  it.each([
    ["not-a-date", ""],
    ["2026-08-05T12:00:30.000Z", "just now"],
    ["2026-08-05T11:59:01.000Z", "just now"],
    ["2026-08-05T11:59:00.000Z", "1m"],
    ["2026-08-05T11:01:00.000Z", "59m"],
    ["2026-08-05T11:00:00.000Z", "1h"],
    ["2026-08-04T13:00:00.000Z", "23h"],
    ["2026-08-04T12:00:00.000Z", "1d"],
    ["2026-07-30T12:00:00.000Z", "6d"],
    ["2026-07-29T12:00:00.000Z", "1w"],
    ["2026-07-16T12:00:00.000Z", "2w"],
  ] as const)("formats %s as %s at a fixed clock", (createdAt, expected) => {
    expect(
      formatNotificationTimeAgo(
        createdAt,
        Date.parse("2026-08-05T12:00:00.000Z"),
      ),
    ).toBe(expected);
  });

  it("carries persisted content and read state without inventing detail", () => {
    expect(
      toNotificationItem(
        notification({ body: null, readAt: "2026-08-05T12:05:00.000Z" }),
        Date.parse("2026-08-05T12:06:00.000Z"),
      ),
    ).toMatchObject({
      id: "notification-1",
      title: "Account update",
      detail: "",
      unread: false,
      timeAgo: "6m",
    });
  });

  it("renders a safe action as one full-row link with explicit copy and name", () => {
    const actionable: NotificationItem = {
      id: "actionable",
      kind: "application_status",
      icon: "action.apply",
      title: "Application update",
      detail: "Your application moved to Reviewing.",
      timeAgo: "1m",
      unread: true,
      actionHref: "/applications/application-1",
    };
    const inert: NotificationItem = {
      id: "unsafe-normalized-to-null",
      kind: "application_status",
      icon: "system.warning",
      title: "Unsafe destination removed",
      detail: "This notification stays readable without navigation.",
      timeAgo: "2m",
      unread: false,
      actionHref: null,
    };

    const html = renderToStaticMarkup(
      createElement(NotificationList, { items: [actionable, inert] }),
    );

    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain('href="/applications/application-1"');
    expect(html).toContain(
      'aria-label="Open unread notification: Application update"',
    );
    expect(html).toContain(">Open<");
    expect(html).toContain("Unread: ");
    expect(html).not.toContain(
      'aria-label="Open notification: Unsafe destination removed"',
    );
  });

  it("pins touch, focus, wrapping, and narrow-card CSS contracts", () => {
    const source = read("components/seeker/NotificationList.tsx");
    const css = read("components/seeker/NotificationList.module.css");

    expect(source).toContain('import Link from "next/link"');
    expect(source).toContain("`Open unread notification: ${item.title}`");
    expect(source).toContain("`Open notification: ${item.title}`");
    expect(source).toContain("aria-label={actionLabel}");
    expect(source).not.toContain("markNotificationRead");
    expect(source).not.toContain("onClick=");

    expect(css).toMatch(
      /\.item\s*{[^}]*min-height:\s*var\(--tap-min\);/s,
    );
    expect(css).toMatch(
      /\.actionLink:focus-visible\s*{[^}]*box-shadow:\s*var\(--ui-focus-ring\);/s,
    );
    for (const selector of ["body", "title", "detail"] as const) {
      expect(css).toMatch(
        new RegExp(
          `\\.${selector}\\s*\\{[^}]*min-width:\\s*0;[^}]*overflow-wrap:\\s*anywhere;`,
          "s",
        ),
      );
    }
    expect(css).toMatch(/@media\s*\(max-width:\s*360px\)/);
    expect(css).toMatch(
      /grid-template-columns:\s*auto minmax\(0,\s*1fr\);/,
    );
  });
});

describe("canonical host notification wiring", () => {
  const route = "app/[locale]/(host)/host/notifications/page.tsx";
  const routeSource = exists(route) ? read(route) : "";
  const seekerRoute = "app/[locale]/(seeker)/notifications/page.tsx";
  const seekerRouteSource = exists(seekerRoute) ? read(seekerRoute) : "";

  it("ships the host route over persisted notifications and the shared adapter", () => {
    expect(exists(route), `${route} is missing`).toBe(true);
    expect(routeSource).toContain("getNotifications");
    expect(routeSource).toContain("toNotificationItem");
    expect(routeSource).toContain(
      "components/notifications/notificationItems",
    );
    expect(routeSource).toContain("markAllNotificationsReadAction");
    expect(routeSource).toContain("<NotificationList");
  });

  it.each([
    ["host", route, routeSource],
    ["seeker", seekerRoute, seekerRouteSource],
  ] as const)(
    "short-circuits the %s dev fixture by exact role before auth and preserves production errors",
    (role, routePath, source) => {
      expect(exists(routePath), `${routePath} is missing`).toBe(true);
      expect(source).toContain("isDevBenchEnabled");
      expect(source).toContain("readDevRole");
      expect(source).toContain(
        `isDevBenchEnabled() && (await readDevRole()) === "${role}"`,
      );

      const devFixtureGuard = source.indexOf("if (isDevBenchEnabled()");
      const authCall = source.indexOf("await auth()");
      const notificationRead = source.indexOf("await getNotifications(");

      expect(devFixtureGuard).toBeGreaterThan(-1);
      expect(authCall).toBeGreaterThan(devFixtureGuard);
      expect(notificationRead).toBeGreaterThan(devFixtureGuard);
      expect(source).toContain("<NotificationList");
      expect(source).toContain('"use server";');
      expect(source).not.toMatch(/getNotifications\([^)]*\)\s*\.catch\(/s);
      expect(source).not.toContain(".catch(() => [])");
    },
  );

  it("keeps messages and notifications as distinct shell links and counts", () => {
    const shell = read("components/host/HostShell.tsx");

    expect(shell).toContain("readonly unreadMessages?: number;");
    expect(shell).toContain("readonly unreadNotifications?: number;");
    expect(shell).toContain('href={hrefFor("/host/messages")}');
    expect(shell).toContain('href={hrefFor("/host/notifications")}');
    expect(shell).toContain("messageUnread > 0");
    expect(shell).toContain("unreadNotifications > 0");
  });

  it("includes the notification destination and badge in host navigation", () => {
    const notifications = HOST_NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.href === "/host/notifications",
    );

    expect(notifications).toEqual({
      href: "/host/notifications",
      label: "Notifications",
      icon: "nav.notifications",
      badgeKey: "notifications",
    });
  });

  it("passes both unread counts from the host layout", () => {
    const layout = read("app/[locale]/(host)/layout.tsx");

    expect(layout).toContain("getUnreadMessageCount");
    expect(layout).toContain("getUnreadNotificationCount");
    expect(layout).toContain("unreadMessages={unreadMessages}");
    expect(layout).toContain("unreadNotifications={unreadNotifications}");
  });
});
