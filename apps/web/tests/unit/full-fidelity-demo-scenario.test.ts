import { describe, expect, it } from "vitest";

import { MATCH_SCORE_WEIGHTS, PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  DEFAULT_DEMO_SESSION_STATE,
  DEMO_ANNOUNCEMENTS,
  DEMO_APPLICATIONS,
  DEMO_APPLICATION_STAGES,
  DEMO_BILLING,
  DEMO_CONVERSATIONS,
  DEMO_CURRENT_SEEKER,
  DEMO_DATA_LABEL,
  DEMO_INTERVIEWS,
  DEMO_INVITES,
  DEMO_MATCHES,
  DEMO_NOTIFICATIONS,
  DEMO_NOW,
  DEMO_ORGANIZATION,
  DEMO_ROLES,
  DEMO_SCENARIO,
  DEMO_TEAM,
  DEMO_WEATHER,
  createDefaultDemoSessionState,
  demoApplicationStage,
  deriveDemoApplicationStageCounts,
  deriveDemoHostSummary,
  deriveDemoRoleCounts,
  deriveDemoSeekerSummary,
} from "../../components/demo/full-fidelity/scenario";

function collectIdValues(value: unknown, path = "root"): readonly [string, string][] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectIdValues(entry, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const nextPath = `${path}.${key}`;
    if (key === "id" || key.endsWith("Id")) {
      return typeof entry === "string" ? [[nextPath, entry] as [string, string]] : [];
    }
    if (key.endsWith("Ids") && Array.isArray(entry)) {
      return entry
        .filter((id): id is string => typeof id === "string")
        .map((id) => [nextPath, id] as [string, string]);
    }
    return collectIdValues(entry, nextPath);
  });
}

function weightedScore(match: (typeof DEMO_MATCHES)[number]): number {
  return Math.round(
    (Object.keys(MATCH_SCORE_WEIGHTS) as (keyof typeof MATCH_SCORE_WEIGHTS)[]).reduce(
      (sum, component) =>
        sum + match.components[component] * (MATCH_SCORE_WEIGHTS[component] / 100),
      0,
    ),
  );
}

describe("full-fidelity demo scenario", () => {
  it("is a fixed, plainly fictional, JSON-serializable account", () => {
    expect(DEMO_NOW).toBe("2026-08-05T16:00:00.000Z");
    expect(DEMO_ORGANIZATION.name).not.toBe("Explore & Earn");
    expect(DEMO_ORGANIZATION.fictional).toBe(true);
    expect(DEMO_CURRENT_SEEKER.fictional).toBe(true);
    expect(DEMO_SCENARIO.disclosure.toLowerCase()).toContain("fictional");
    expect(DEMO_SCENARIO.disclosure.toLowerCase()).toContain("browser session");
    expect(() => JSON.stringify(DEMO_SCENARIO)).not.toThrow();
    expect(JSON.parse(JSON.stringify(DEMO_SCENARIO))).toEqual(DEMO_SCENARIO);
  });

  it("names every entity and relationship with the isolated demo namespace", () => {
    const ids = collectIdValues(DEMO_SCENARIO);
    expect(ids.length).toBeGreaterThan(80);
    for (const [path, id] of ids) {
      expect(id, path).toMatch(/^demo_[a-z0-9_]+$/);
    }
  });

  it("contains exactly three live, one draft, and one closed role", () => {
    expect(deriveDemoRoleCounts(DEMO_ROLES)).toEqual({
      active: 3,
      draft: 1,
      closed: 1,
      total: 5,
    });
    for (const role of DEMO_ROLES) {
      if (role.status === "live") {
        expect(role.publishedAt, role.id).not.toBeNull();
        expect(role.closedAt, role.id).toBeNull();
      } else if (role.status === "draft") {
        expect(role.publishedAt, role.id).toBeNull();
        expect(role.closedAt, role.id).toBeNull();
        expect(role.season.applicationDeadline, role.id).toBeNull();
      } else {
        expect(role.closedAt, role.id).not.toBeNull();
        expect(role.openPositions, role.id).toBe(0);
      }
    }
  });

  it("uses the six canonical host stages while keeping interviews separate", () => {
    const counts = deriveDemoApplicationStageCounts(DEMO_APPLICATIONS);
    expect(Object.keys(counts)).toEqual(DEMO_APPLICATION_STAGES);
    expect(counts).toEqual({
      New: 1,
      Reviewing: 1,
      Saved: 1,
      Offered: 1,
      Accepted: 1,
      Closed: 1,
    });
    expect(new Set(DEMO_APPLICATIONS.map((application) => application.status))).toEqual(
      new Set([
        "applied",
        "reviewing",
        "saved_by_host",
        "offered",
        "accepted",
        "not_selected",
      ]),
    );
    expect(DEMO_APPLICATION_STAGES).not.toContain("Interview" as never);
    expect(DEMO_INTERVIEWS.length).toBe(3);
    expect(DEMO_INTERVIEWS.filter((interview) => interview.status === "selected")).toHaveLength(2);
    for (const application of DEMO_APPLICATIONS) {
      expect(DEMO_APPLICATION_STAGES).toContain(demoApplicationStage(application.status));
    }
  });

  it("keeps every cross-role relationship resolvable", () => {
    const roleIds = new Set(DEMO_ROLES.map((role) => role.id));
    const personIds = new Set([
      ...DEMO_SCENARIO.candidates.map((candidate) => candidate.id),
      ...DEMO_TEAM.map((person) => person.id),
    ]);
    const applicationIds = new Set(DEMO_APPLICATIONS.map((application) => application.id));
    const conversationIds = new Set(DEMO_CONVERSATIONS.map((conversation) => conversation.id));
    const interviewIds = new Set(DEMO_INTERVIEWS.map((interview) => interview.id));

    for (const application of DEMO_APPLICATIONS) {
      expect(roleIds.has(application.roleId), application.id).toBe(true);
      expect(personIds.has(application.seekerId), application.id).toBe(true);
      const role = DEMO_ROLES.find((item) => item.id === application.roleId)!;
      expect(application.submittedAt >= (role.publishedAt ?? application.submittedAt), application.id).toBe(
        true,
      );
    }
    for (const interview of DEMO_INTERVIEWS) {
      expect(applicationIds.has(interview.applicationId), interview.id).toBe(true);
      expect(personIds.has(interview.organizerId), interview.id).toBe(true);
      expect(interview.endsAt > interview.startsAt, interview.id).toBe(true);
    }
    for (const conversation of DEMO_CONVERSATIONS) {
      expect(applicationIds.has(conversation.applicationId), conversation.id).toBe(true);
      expect(roleIds.has(conversation.roleId), conversation.id).toBe(true);
      for (const participantId of conversation.participantIds) {
        expect(personIds.has(participantId), `${conversation.id}.${participantId}`).toBe(true);
      }
      for (const message of conversation.messages) {
        expect(conversation.participantIds).toContain(message.senderId);
        for (const readerId of message.readByParticipantIds) {
          expect(conversation.participantIds).toContain(readerId);
        }
      }
    }
    for (const notification of DEMO_NOTIFICATIONS) {
      expect(personIds.has(notification.recipientId), notification.id).toBe(true);
      if (notification.roleId) expect(roleIds.has(notification.roleId), notification.id).toBe(true);
      if (notification.applicationId) {
        expect(applicationIds.has(notification.applicationId), notification.id).toBe(true);
      }
      if (notification.conversationId) {
        expect(conversationIds.has(notification.conversationId), notification.id).toBe(true);
      }
      if (notification.interviewId) {
        expect(interviewIds.has(notification.interviewId), notification.id).toBe(true);
      }
    }
    for (const invite of DEMO_INVITES) {
      expect(roleIds.has(invite.roleId), invite.id).toBe(true);
      expect(personIds.has(invite.seekerId), invite.id).toBe(true);
      expect(personIds.has(invite.sentById), invite.id).toBe(true);
    }
  });

  it("keeps Priya's saved role, application, interview, message, and notifications aligned", () => {
    const priyaApplications = DEMO_APPLICATIONS.filter(
      (application) => application.seekerId === DEMO_CURRENT_SEEKER.id,
    );
    expect(priyaApplications).toHaveLength(1);
    expect(priyaApplications[0]?.status).toBe("reviewing");
    expect(DEFAULT_DEMO_SESSION_STATE.listingDecisions[priyaApplications[0]!.roleId]).toBe(
      "applied",
    );
    expect(DEMO_CURRENT_SEEKER.savedRoleIds).toHaveLength(1);
    expect(DEFAULT_DEMO_SESSION_STATE.listingDecisions[DEMO_CURRENT_SEEKER.savedRoleIds[0]!]).toBe(
      "saved",
    );

    const applicationIds = new Set(priyaApplications.map((application) => application.id));
    const priyaInterviews = DEMO_INTERVIEWS.filter((interview) =>
      applicationIds.has(interview.applicationId),
    );
    expect(priyaInterviews).toHaveLength(1);
    expect(priyaInterviews[0]?.status).toBe("selected");
    expect(priyaInterviews[0]!.startsAt > DEMO_NOW).toBe(true);
    expect(
      DEMO_CONVERSATIONS.some(
        (conversation) =>
          applicationIds.has(conversation.applicationId) &&
          conversation.participantIds.includes(DEMO_CURRENT_SEEKER.id),
      ),
    ).toBe(true);
    expect(
      DEMO_NOTIFICATIONS.some(
        (notification) =>
          notification.recipientId === DEMO_CURRENT_SEEKER.id &&
          notification.interviewId === priyaInterviews[0]!.id,
      ),
    ).toBe(true);
  });

  it("carries complete Housing and Meals evidence slots without presenting stock scenes as proof", () => {
    expect(DEMO_ORGANIZATION.housingLibrary.map((photo) => photo.slot)).toEqual([
      "sleeping_area",
      "bathroom",
      "kitchen",
      "dining_common",
    ]);
    for (const role of DEMO_ROLES) {
      expect(role.housing.provision, role.id).toBe("provided");
      expect(role.housing.summary, role.id).toBeTruthy();
      expect(role.meals.summary, role.id).toBeTruthy();
      expect(role.pay.summary, role.id).toMatch(/^\$/);
      expect(role.meals.photos.map((photo) => photo.slot), role.id).toEqual([
        "kitchen",
        "prepared",
        "dining",
        "misc",
      ]);
    }
    const photos = [
      DEMO_ORGANIZATION.coverPhoto,
      ...DEMO_ORGANIZATION.gallery,
      ...DEMO_ROLES.map((role) => role.coverPhoto),
    ];
    for (const photo of photos) {
      expect(photo.presentation, photo.id).toBe("illustrative_demo_scene");
      expect(photo.photoSlug, photo.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("provides ten clearly illustrative days of weather for the real scenario location", () => {
    expect(DEMO_WEATHER.days).toHaveLength(10);
    expect(DEMO_WEATHER.dataKind).toBe("illustrative_demo_forecast");
    expect(DEMO_WEATHER.disclosure.toLowerCase()).toContain("not live weather");
    expect(DEMO_SCENARIO.locations.some((location) => location.id === DEMO_WEATHER.locationId)).toBe(
      true,
    );
    for (let index = 1; index < DEMO_WEATHER.days.length; index += 1) {
      expect(DEMO_WEATHER.days[index]!.date > DEMO_WEATHER.days[index - 1]!.date).toBe(true);
    }
  });

  it("derives honest billing and supported usage without a customer or team-seat claim", () => {
    expect(DEMO_BILLING.mode).toBe("demo_only_no_customer");
    expect(DEMO_BILLING.entitlements).toEqual(PLAN_ENTITLEMENTS.enterprise);
    expect(DEMO_BILLING.entitlements.teamSeats).toBe(0);
    expect(DEMO_TEAM.filter((person) => person.workspaceAccess === "owner")).toHaveLength(1);
    expect(DEMO_TEAM.filter((person) => person.workspaceAccess === "none")).toHaveLength(2);
    expect(DEMO_BILLING.note).toContain("No Stripe customer");
  });

  it("does not invent reviews, campaigns, scheduled announcements, or engagement analytics", () => {
    expect(DEMO_ORGANIZATION.reviews).toEqual([]);
    expect(DEMO_SCENARIO).not.toHaveProperty("campaigns");
    for (const announcement of DEMO_ANNOUNCEMENTS) {
      expect(announcement.status).not.toBe("scheduled");
      expect(announcement).not.toHaveProperty("scheduledAt");
      expect(announcement).not.toHaveProperty("engagement");
      expect(announcement).not.toHaveProperty("views");
      expect(announcement.demoLabel).toBe(DEMO_DATA_LABEL);
      expect(announcement.status === "published").toBe(announcement.publishedAt !== null);
    }
  });

  it("derives every displayed total and every match score from its source records", () => {
    const host = deriveDemoHostSummary({
      roles: DEMO_ROLES,
      applications: DEMO_APPLICATIONS,
      interviews: DEMO_INTERVIEWS,
      conversations: DEMO_CONVERSATIONS,
      invites: DEMO_INVITES,
      announcements: DEMO_ANNOUNCEMENTS,
      organization: DEMO_ORGANIZATION,
      ownerId: DEMO_TEAM.find((person) => person.workspaceAccess === "owner")!.id,
      now: DEMO_NOW,
    });
    const seeker = deriveDemoSeekerSummary({
      seeker: DEMO_CURRENT_SEEKER,
      roles: DEMO_ROLES,
      applications: DEMO_APPLICATIONS,
      interviews: DEMO_INTERVIEWS,
      conversations: DEMO_CONVERSATIONS,
      notifications: DEMO_NOTIFICATIONS,
      matches: DEMO_MATCHES,
      now: DEMO_NOW,
    });
    expect(DEMO_SCENARIO.summaries).toEqual({ host, seeker });
    expect(host).toMatchObject({
      applicationsTotal: 6,
      upcomingInterviews: 2,
      offersAwaitingResponse: 1,
      unreadConversationCount: 1,
      profileCompletion: 90,
      invitesUsedThisMonth: 1,
      announcementsUsedThisMonth: 1,
    });
    expect(seeker).toMatchObject({
      savedRoles: 1,
      applications: 1,
      upcomingInterviews: 1,
      unreadNotifications: 2,
      unreadConversationCount: 1,
      recommendations: 3,
      profileCompletion: 95,
    });
    for (const match of DEMO_MATCHES) {
      expect(match.score, match.id).toBe(weightedScore(match));
      expect(match.score, match.id).toBeGreaterThanOrEqual(75);
    }
  });

  it("creates a clean independent session reset state", () => {
    const first = createDefaultDemoSessionState();
    const second = createDefaultDemoSessionState();
    expect(first).toEqual(DEFAULT_DEMO_SESSION_STATE);
    expect(second).toEqual(DEFAULT_DEMO_SESSION_STATE);
    expect(first).not.toBe(second);
    expect(first.listingDecisions).not.toBe(second.listingDecisions);
    expect(first.readNotificationIds).not.toBe(second.readNotificationIds);
    expect(first.messageDrafts).not.toBe(second.messageDrafts);
  });
});
