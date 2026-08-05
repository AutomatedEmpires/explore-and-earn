import { existsSync, readFileSync } from "node:fs";

import type { Notification } from "@explore-and-earn/db";
import { describe, expect, it } from "vitest";

import { HOST_NAV_GROUPS } from "../../components/host/hostNav";
import {
  formatNotificationTimeAgo,
  toNotificationItem,
} from "../../components/notifications/notificationItems";

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
});

describe("canonical host notification wiring", () => {
  const route = "app/[locale]/(host)/host/notifications/page.tsx";
  const routeSource = exists(route) ? read(route) : "";

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
