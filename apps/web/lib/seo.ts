import type { PublicListingDetail, PublicListingDetailHost } from "@explore-and-earn/db";

/**
 * Generate a schema.org JobPosting JSON-LD script for a listing detail page.
 * Enhances SEO by providing structured data to search engines.
 *
 * Returns NULL when the listing cannot honestly satisfy Google's location
 * requirement (a physical jobLocation OR an explicit TELECOMMUTE): a
 * non-remote listing with no location data gets no JobPosting block at all —
 * emitting one with a fabricated location would violate the no-fabrication
 * law, and emitting one with neither is invalid structured data that can hurt
 * the whole page's eligibility. Callers must render conditionally.
 *
 * @see https://schema.org/JobPosting
 * @see https://developers.google.com/search/docs/appearance/structured-data/job-posting
 */
export function generateJobPostingJsonLd(
  listing: PublicListingDetail,
  host: PublicListingDetailHost | null,
  baseUrl: string,
): string | null {
  const listingUrl = `${baseUrl}/listing/${listing.id}`;

  // baseSalary surfaces exactly what the host stated: a range when max exists
  // (minValue/maxValue render better in Google Jobs than a bare value and were
  // previously discarded), a single value otherwise. unitText is emitted ONLY
  // when the stated unit maps to Google's accepted enum (HOUR/DAY/WEEK/MONTH/
  // YEAR) — "other"/absent units get NO unitText rather than an invented
  // "TOTAL", which is outside the enum and can invalidate the whole baseSalary
  // property in Search Console (review 2026-07-22; no-fabrication law).
  const salaryUnitText =
    listing.compensationUnit && listing.compensationUnit !== "other"
      ? listing.compensationUnit.toUpperCase()
      : undefined;
  const baseSalary =
    listing.compensationMinCents != null
      ? {
          "@type": "MonetaryAmount",
          currency: listing.compensationCurrency,
          value: {
            "@type": "QuantitativeValue",
            ...(listing.compensationMaxCents != null &&
            listing.compensationMaxCents !== listing.compensationMinCents
              ? {
                  minValue: listing.compensationMinCents / 100,
                  maxValue: listing.compensationMaxCents / 100,
                }
              : { value: listing.compensationMinCents / 100 }),
            ...(salaryUnitText ? { unitText: salaryUnitText } : {}),
          },
        }
      : undefined;

  const hiringOrganization = host
    ? {
        "@type": "Organization",
        name: host.companyName,
        // Only link a public profile that exists — fixture/preview hosts have
        // no id and must not emit a dead /host/ URL to crawlers.
        ...(host.id ? { sameAs: `${baseUrl}/host/${host.id}` } : {}),
      }
    : undefined;

  const jobLocation =
    listing.locationDisplay && listing.latitude && listing.longitude
      ? {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: listing.locationDisplay,
          },
          geo: {
            "@type": "GeoCoordinates",
            latitude: listing.latitude,
            longitude: listing.longitude,
          },
        }
      : listing.locationDisplay
        ? {
            "@type": "Place",
            address: {
              "@type": "PostalAddress",
              addressLocality: listing.locationDisplay,
            },
          }
        : undefined;

  const validThrough = listing.endsAt ?? undefined;
  const datePosted = listing.publishedAt ?? undefined;

  // TELECOMMUTE is asserted ONLY for genuinely remote listings (the category
  // is the product's remote signal). A listing that merely lacks a location
  // string is NOT remote — its location is missing data, and missing data is
  // omitted, never re-labeled (no-fabrication law). Likewise no
  // applicantLocationRequirements is emitted: the data model records no
  // country eligibility, so claiming one would be fabricated.
  const isRemote = listing.category === "remote";

  // Google Jobs requires a physical jobLocation OR TELECOMMUTE. When neither
  // can be stated honestly, emit no JobPosting at all rather than an invalid
  // or fabricated one (see the function doc).
  if (!isRemote && !jobLocation) return null;

  const jobPosting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    url: listingUrl,
    title: listing.title,
    description:
      listing.description ??
      `${listing.title} opportunity at ${host?.companyName ?? "a host organization"}.`,
    identifier: {
      "@type": "PropertyValue",
      name: host?.companyName ?? "Explore & Earn",
      value: listing.id,
    },
    datePosted,
    validThrough,
    // employmentType is intentionally omitted: the listing model records no
    // employment classification, and schema.org values (FULL_TIME, CONTRACTOR,
    // …) are legal-ish claims we cannot derive honestly today.
    hiringOrganization,
    jobLocation,
    ...(isRemote ? { jobLocationType: "TELECOMMUTE" } : {}),
    // Applications happen on-platform, not via an external redirect chain.
    directApply: true,
    baseSalary,
  };

  // Remove undefined fields to keep the output clean
  const cleaned = JSON.parse(
    JSON.stringify(jobPosting, (_, v) => (v === undefined ? null : v)),
  );
  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === null) delete cleaned[key];
  });

  // Escape characters that can break out of a <script> tag so user-controlled
  // fields (title, description, companyName) cannot inject </script> or similar.
  return escapeJsonLdHtml(JSON.stringify(cleaned, null, 2));
}

/**
 * Escape a JSON string so it is safe to embed inside a
 * `<script type="application/ld+json">` block \u2014 prevents `</script>` breakout
 * and line-separator injection from any user-controlled field.
 */
export function escapeJsonLdHtml(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Organization JSON-LD for the homepage \u2014 establishes Explore & Earn as a
 * named entity for search engines and AI crawlers (logo, description, socials).
 *
 * @see https://schema.org/Organization
 */
export function generateOrganizationJsonLd(baseUrl: string): string {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Explore & Earn",
    alternateName: "ExploreAndEarn",
    url: baseUrl,
    logo: `${baseUrl}/opengraph-image`,
    description:
      "Explore & Earn is a discovery marketplace for lifestyle work \u2014 seasonal, remote, farm, ranch, maritime, and hospitality opportunities that show housing, meals, and pay on every listing.",
    sameAs: [
      "https://facebook.com/exploreandearn",
      "https://instagram.com/exploreandearn",
      "https://threads.net/@exploreandearn",
    ],
  };
  return escapeJsonLdHtml(JSON.stringify(org, null, 2));
}

/**
 * WebSite JSON-LD with a SearchAction so engines can surface a sitelinks
 * search box pointed at the public discovery surface (/seek?q=...).
 *
 * @see https://schema.org/WebSite
 */
export function generateWebSiteJsonLd(baseUrl: string): string {
  const site = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Explore & Earn",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/seek?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
  return escapeJsonLdHtml(JSON.stringify(site, null, 2));
}

/**
 * FAQPage JSON-LD built from plain question/answer pairs. The same content is
 * rendered visibly on /faq, so this is rich-result eligible and not cloaking.
 *
 * @see https://schema.org/FAQPage
 */
export function generateFaqJsonLd(
  items: ReadonlyArray<{ question: string; answer: string }>,
): string {
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
  return escapeJsonLdHtml(JSON.stringify(faq, null, 2));
}

/**
 * BreadcrumbList JSON-LD for public detail pages — gives search engines (and AI
 * crawlers) the page's place in the site hierarchy, enabling breadcrumb rich
 * results. Pass items in order from site root to the current page.
 *
 * @see https://schema.org/BreadcrumbList
 */
export function generateBreadcrumbJsonLd(
  items: ReadonlyArray<{ name: string; url: string }>,
): string {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return escapeJsonLdHtml(JSON.stringify(breadcrumb, null, 2));
}
