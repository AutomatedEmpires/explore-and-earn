import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { hostDemoPublicProfile } from "../../components/demo/full-fidelity/host/adapter";
import { HostProfileHero } from "../../components/host/HostProfileHero";

describe("host profile identity fallback", () => {
  it("renders a named organization monogram instead of an empty avatar", () => {
    const html = renderToStaticMarkup(
      createElement(HostProfileHero, {
        host: { ...hostDemoPublicProfile, photoUrl: null },
        coverPhotoUrl: null,
        listingCount: 3,
      }),
    );

    expect(html).toContain('aria-label="Juniper Wake Lodge monogram"');
    expect(html).toContain(">JWL<");
    expect(html).not.toContain('data-icon="nav.profile"');
  });
});
