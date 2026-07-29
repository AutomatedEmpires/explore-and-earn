import { describe, expect, it } from "vitest";

import {
  attentionActionLabel,
  hostLede,
  type AttentionItem,
} from "../../components/host/workspaceModel";

/**
 * The host's morning sentence (redesign W2): written from the SAME queue the
 * page renders, so the lede and the list cannot disagree. These tests pin
 * that, plus the honesty of the quiet states.
 */

function item(overrides: Partial<AttentionItem>): AttentionItem {
  return {
    id: "x",
    title: "Something needs handling",
    evidence: "A real record says so.",
    href: "/host/applicants",
    tone: "soon",
    ...overrides,
  } as AttentionItem;
}

describe("hostLede", () => {
  it("names the top items in queue order, capped at three, counting the rest", () => {
    const lede = hostLede(
      [
        item({ id: "a", title: "3 applicants nobody has opened" }),
        item({ id: "b", title: "2 unread messages" }),
        item({ id: "c", title: "Trail Crew closes in 3 days" }),
        item({ id: "d", title: "Finish your employer profile" }),
      ],
      2,
      14,
    );
    expect(lede).toBe(
      "Three things need you today: 3 applicants nobody has opened, 2 unread messages, and Trail Crew closes in 3 days. 1 more item can wait.",
    );
  });

  it("speaks in the singular for one item", () => {
    const lede = hostLede([item({ title: "2 unread messages" })], 1, 5);
    expect(lede).toBe("One thing needs you today: 2 unread messages.");
  });

  it("states the season's real shape when the queue is empty", () => {
    expect(hostLede([], 2, 14)).toBe(
      "All clear today — 2 listings live, 14 people in your pipeline.",
    );
    expect(hostLede([], 1, 1)).toBe(
      "All clear today — one listing live, one person in your pipeline.",
    );
  });

  it("greets the first-run host with an opening, not an apology", () => {
    expect(hostLede([], 0, 0)).toBe(
      "Your workspace is ready to open — post your first opportunity and the season starts.",
    );
  });
});

describe("attentionActionLabel", () => {
  it("gives each destination its verb", () => {
    expect(attentionActionLabel(item({ id: "billing", href: "/host/billing" }))).toBe(
      "Fix billing",
    );
    expect(attentionActionLabel(item({ href: "/host/applicants" }))).toBe("Review");
    expect(attentionActionLabel(item({ href: "/host/messages" }))).toBe("Reply");
    expect(
      attentionActionLabel(item({ href: "/host/listings/abc/edit" })),
    ).toBe("Complete");
    expect(attentionActionLabel(item({ href: "/host/listings/new" }))).toBe("Post it");
    expect(attentionActionLabel(item({ href: "/host/profile/edit" }))).toBe("Finish");
    expect(attentionActionLabel(item({ href: "/host/listings/abc" }))).toBe("Open");
  });
});
