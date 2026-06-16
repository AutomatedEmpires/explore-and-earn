import type { PublicListingDetail, PublicListingDetailHost } from "@explore-and-earn/db";

/**
 * Generate a schema.org JobPosting JSON-LD script for a listing detail page.
 * Enhances SEO by providing structured data to search engines.
 *
 * @see https://schema.org/JobPosting
 * @see https://developers.google.com/search/docs/appearance/structured-data/job-posting
 */
export function generateJobPostingJsonLd(
  listing: PublicListingDetail,
  host: PublicListingDetailHost | null,
  baseUrl: string,
): string {
  const listingUrl = `${baseUrl}/listing/${listing.id}`;
  const employmentType = "CONTRACTOR"; // Explore & Earn listings are work-exchange/contract

  const baseSalary =
    listing.compensationMinCents != null
      ? {
          "@type": "MonetaryAmount",
          currency: listing.compensationCurrency,
          value: {
            "@type": "QuantitativeValue",
            value: listing.compensationMinCents / 100,
            unitText:
              listing.compensationUnit && listing.compensationUnit !== "other"
                ? listing.compensationUnit.toUpperCase()
                : "TOTAL",
          },
        }
      : undefined;

  const hiringOrganization = host
    ? {
        "@type": "Organization",
        name: host.companyName,
        sameAs: `${baseUrl}/host/${host.id}`,
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
    employmentType,
    hiringOrganization,
    jobLocation,
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
      "https://x.com/exploreandearn",
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
