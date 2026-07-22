import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("conversation open entry points", () => {
  it("keeps GET message pages read-only", () => {
    const seekerMessages = source(
      "app/[locale]/(seeker)/messages/page.tsx",
    );
    const hostMessages = source(
      "app/[locale]/(host)/host/messages/page.tsx",
    );

    expect(seekerMessages).not.toContain("getOrCreateConversation");
    expect(hostMessages).not.toContain("getOrCreateConversation");
    expect(seekerMessages).not.toContain("searchParams");
    expect(hostMessages).not.toContain("searchParams");
  });

  it("routes both actors through the explicit server-action control", () => {
    const seekerApplication = source(
      "app/[locale]/(seeker)/applied/[id]/page.tsx",
    );
    const hostApplication = source(
      "app/[locale]/(host)/host/applicants/[id]/page.tsx",
    );
    const button = source(
      "components/messaging/OpenConversationButton.tsx",
    );

    expect(seekerApplication).toContain("<OpenConversationButton");
    expect(hostApplication).toContain("<OpenConversationButton");
    expect(button).toContain("openSeekerApplicationConversationAction");
    expect(button).toContain("openHostApplicationConversationAction");
  });

  it("keeps closed-listing labels behind the participant context RPC", () => {
    const seekerMessages = source(
      "app/[locale]/(seeker)/messages/page.tsx",
    );
    const hostMessages = source(
      "app/[locale]/(host)/host/messages/page.tsx",
    );

    for (const page of [seekerMessages, hostMessages]) {
      expect(page).toContain("getConversationContexts");
      expect(page).not.toContain("getPublicListingsByIds");
    }
  });
});
