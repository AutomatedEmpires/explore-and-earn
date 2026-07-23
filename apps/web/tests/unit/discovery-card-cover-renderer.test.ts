import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DiscoveryCard, type DiscoveryCardData } from "@explore-and-earn/ui";

/**
 * The renderCoverImage seam (responsive card images, 2026-07-23): packages/ui
 * stays framework-agnostic — WITHOUT a renderer the card ships its plain <img>
 * exactly as before (non-Next consumers unchanged), WITH one the host app's
 * component renders inside the fixed 16/10 cover box and receives the full
 * cover contract (src/alt/className/loading/fetchPriority).
 */

const data: DiscoveryCardData = {
  id: "11111111-2222-3333-4444-555555555555",
  hostName: "Sunrise Orchards",
  title: "Orchard Crew",
  category: "farm",
  location: "Wenatchee, WA",
  opportunityWindow: "Jun – Sep",
  triad: { housing: "Included", meals: "Included", pay: "$18/hr" },
  coverImageUrl: "https://res.cloudinary.com/demo/t_ee-card/cover.jpg",
};

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(DiscoveryCard, {
      data,
      surface: "discovery_feed",
      ...props,
    } as never),
  );
}

describe("DiscoveryCard cover renderer seam", () => {
  it("without a renderer, ships the plain <img> exactly as before", () => {
    const html = render({ imageLoading: "eager" });
    expect(html).toContain("<img");
    expect(html).toContain('loading="eager"');
    // React serializes the attribute camelCased (fetchPriority) — match either.
    expect(html.toLowerCase()).toContain('fetchpriority="high"');
    expect(html).toContain(data.coverImageUrl!);
  });

  it("with a renderer, delegates the cover and passes the full contract", () => {
    const seen: Array<Record<string, unknown>> = [];
    const html = render({
      imageLoading: "eager",
      renderCoverImage: (cover: Record<string, unknown>) => {
        seen.push(cover);
        return createElement("picture", { "data-custom-cover": "true" });
      },
    });
    expect(html).toContain('data-custom-cover="true"');
    // The default <img loading=...> must NOT also render (grep excludes the
    // host-avatar img, which has no loading attribute).
    expect(html).not.toContain('loading="eager"');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      src: data.coverImageUrl,
      alt: "Sunrise Orchards cover",
      loading: "eager",
      fetchPriority: "high",
    });
    expect(typeof seen[0]!.className).toBe("string");
    expect((seen[0]!.className as string).length).toBeGreaterThan(0);
  });

  it("lazy covers pass no fetchPriority", () => {
    const seen: Array<Record<string, unknown>> = [];
    render({
      renderCoverImage: (cover: Record<string, unknown>) => {
        seen.push(cover);
        return null;
      },
    });
    expect(seen[0]).toMatchObject({ loading: "lazy" });
    expect(seen[0]!.fetchPriority).toBeUndefined();
  });

  it("coverless listings render the category watermark, never the renderer", () => {
    const seen: unknown[] = [];
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, {
        data: { ...data, coverImageUrl: undefined },
        surface: "discovery_feed",
        renderCoverImage: (cover: unknown) => {
          seen.push(cover);
          return null;
        },
      } as never),
    );
    expect(seen).toHaveLength(0);
    expect(html).not.toContain("<img");
  });
});
