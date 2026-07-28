import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CreditsPage, {
  generateMetadata,
} from "../../app/[locale]/(legal)/credits/page";
import { SITE_PHOTOS } from "../../lib/sitePhotos";

/**
 * /credits is the ATTRIBUTION surface, so "it renders" is not the bar — the
 * bar is that EVERY shipped photograph's credit is actually on the page. For
 * the CC-BY / CC-BY-SA entries that is a licence condition; for the Unsplash
 * entries it is the API guideline on crediting photographers.
 *
 * This renders the real page component (not a fixture) and asserts each
 * manifest entry's photographer, licence, and source link are present, so a
 * photo added to the manifest without reaching this page fails here.
 */

/**
 * React escapes `&` → `&amp;` and `'` → `&#x27;` in the markup it emits, so
 * asserting raw manifest values against the raw HTML would fail on every
 * attribution URL (they carry utm query strings) and every alt string with an
 * apostrophe. Decode once and assert against the text a reader actually sees.
 */
function decodeEntities(html: string): string {
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function render(): string {
  return decodeEntities(renderToStaticMarkup(createElement(CreditsPage)));
}

describe("/credits renders every manifest entry", () => {
  const html = render();

  it("renders one credit row per photograph", () => {
    // The thumbnail is rendered through next/image; count the alt attributes,
    // which are unique per photo.
    for (const photo of SITE_PHOTOS) {
      expect(html, `${photo.slug}: alt text missing`).toContain(photo.alt);
    }
  });

  it.each(SITE_PHOTOS.map((p) => [p.slug, p] as const))(
    "%s credits its photographer by name",
    (_slug, photo) => {
      expect(html).toContain(photo.author);
    },
  );

  it.each(SITE_PHOTOS.map((p) => [p.slug, p] as const))(
    "%s links its licence and its source",
    (_slug, photo) => {
      expect(html).toContain(photo.licenseUrl);
      expect(html).toContain(photo.sourceUrl);
      expect(html).toContain(photo.license);
    },
  );

  it.each(SITE_PHOTOS.map((p) => [p.slug, p] as const))(
    "%s links the photographer's profile",
    (_slug, photo) => {
      expect(html).toContain(photo.authorUrl);
    },
  );

  it("opens outbound attribution links safely", () => {
    // Every external credit link is target=_blank, so each needs noopener.
    const blankLinks = html.match(/<a[^>]*target="_blank"[^>]*>/g) ?? [];
    expect(blankLinks.length).toBeGreaterThan(0);
    for (const link of blankLinks) {
      expect(link).toContain("noopener");
    }
  });

  it("states the people-in-photos honesty caveat", () => {
    // The page must not leave a reader thinking these are photographs of real
    // Explore & Earn hosts, workers or members.
    expect(html).toMatch(/not photographs of Explore & Earn hosts/i);
  });

  it("is indexable and canonical", () => {
    const meta = generateMetadata();
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe("/credits");
    // Bare title — the root template appends the brand; never bake it twice.
    expect(String(meta.title)).not.toContain("Explore & Earn");
  });
});
