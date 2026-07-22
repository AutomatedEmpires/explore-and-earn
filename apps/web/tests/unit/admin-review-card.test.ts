import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DiscoveryCard, type DiscoveryCardData } from "@explore-and-earn/ui";

const DATA: DiscoveryCardData = {
  id: "listing-1",
  hostName: "Glacier Orchard",
  title: "Harvest crew",
  category: "farm",
  location: "Wenatchee, WA",
  opportunityWindow: "September",
  triad: {
    housing: "Included",
    meals: "Included",
    pay: "$20/hour",
  },
};

describe("admin review card actions", () => {
  it("renders no decision controls when the listing is not reviewable", () => {
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, { data: DATA, surface: "admin_review" }),
    );

    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Hold<");
    expect(html).not.toContain(">Reject<");
    expect(html).not.toContain(">Warn<");
  });

  it("renders the complete approve, hold, reject decision set", () => {
    const handler = vi.fn();
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, {
        data: DATA,
        surface: "admin_review",
        onApprove: handler,
        onHold: handler,
        onReject: handler,
      }),
    );

    expect(html).toContain(">Approve<");
    expect(html).toContain(">Hold<");
    expect(html).toContain(">Reject<");
    expect(html).not.toContain(">Warn<");
  });

  it("disables every decision while a mutation is pending", () => {
    const handler = vi.fn();
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, {
        data: DATA,
        surface: "admin_review",
        onApprove: handler,
        onHold: handler,
        onReject: handler,
        adminActionsDisabled: true,
      }),
    );

    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(3);
  });
});
