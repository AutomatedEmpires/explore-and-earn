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
  return JSON.stringify(cleaned, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/ /g, "\\u2028")
    .replace(/ /g, "\\u2029");
}
