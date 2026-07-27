import type { DiscoveryListing } from "./listing";

/**
 * Typed Discovery fixtures — NO backend (Sprint Zero). Every entry conforms to
 * the local DiscoveryListing view-model, which is composed from the frozen
 * @explore-and-earn/contracts registries. These drive the feed until the data
 * layer + Listing contract land.
 *
 * `coordinates` are approximate geocodes of each listing's town centre, used
 * only to place a marker on the /map Mapbox surface. The "Remote · Worldwide"
 * listing intentionally has no coordinates — it is discoverable in the feed but
 * omitted from the map.
 *
 * No fixture carries a `coverImageUrl`. The covers were curated stock photos
 * served by an image CDN this product no longer uses; rather than point at
 * objects that are not there, every fixture now exercises the card's real
 * NO-COVER path — the category watermark (see DiscoveryCard, and the
 * "coverless listings render the category watermark" test). That is also what a
 * host's listing looks like before they upload, so the bench is honest.
 */
export const DISCOVERY_FIXTURES: readonly DiscoveryListing[] = [
  {
    id: "lst_orchard_wenatchee",
    title: "Orchard Harvest Hand",
    category: "farm",
    location: "Wenatchee, Washington",
    coordinates: { lat: 47.4235, lon: -120.3103 },
    opportunityWindow: "Aug–Oct 2026",
    begins: "Aug 12, 2026",
    ends: "Oct 28, 2026",
    status: "live",
    host: { name: "Cascade Bloom Orchards", verified: true, tier: "professional", tagline: "Family orchards in the Wenatchee valley. Harvest season with bunkhouse and farm-fresh meals." },
    benefits: {
      housing: { provision: "provided", summary: "Shared bunkhouse" },
      meals: { provision: "partial", summary: "Lunch on shift" },
      pay: { provision: "provided", summary: "$17/hr" },
    },
    cover: {
      source: "curated",
      scope: "landscape",
      curatedPhotoId: "curated_farm_orchard_01",
      image: {
        masterPath: "curated/landscape/farm-orchard-01.jpg",
        width: 1200,
        height: 800,
        blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        alt: "Sunlit apple orchard rows at harvest time",
      },
    },
    matchScore: 88,
    founding: true,
    payInsight: {
      meterValue: 68,
      minCents: 1700,
      maxCents: 1700,
      unit: "hour",
      currency: "USD",
      note: "Mid-range hourly pay with shared housing already covered.",
    },
  },
  {
    id: "lst_deckhand_sitka",
    title: "Deckhand — Salmon Season",
    category: "maritime",
    location: "Sitka, Alaska",
    coordinates: { lat: 57.0531, lon: -135.33 },
    opportunityWindow: "Jun–Aug 2026",
    begins: "Jun 3, 2026",
    ends: "Aug 29, 2026",
    status: "live",
    host: { name: "North Pacific Fisheries Co-op", verified: true, tier: "enterprise", tagline: "Commercial salmon fishing on the Alaskan coast. Big seas, full board, bigger pay." },
    benefits: {
      housing: { provision: "provided", summary: "Cabin berth aboard" },
      meals: { provision: "provided", summary: "All meals aboard" },
      pay: { provision: "provided", summary: "$220/day + share" },
    },
    cover: {
      source: "uploaded",
      media: {
        id: "media_sitka_cover",
        bucket: "cover_photo",
        masterPath: "listings/lst_deckhand_sitka/cover.jpg",
        width: 1200,
        height: 800,
        alt: "Fishing vessel moored in a calm Alaskan harbor",
        sortOrder: 0,
      },
    },
    conditionalBadges: ["boosted"],
    founding: false,
    visaSupport: true,
    payInsight: {
      meterValue: 84,
      minCents: 22000,
      maxCents: 22000,
      unit: "day",
      currency: "USD",
      note: "High day-rate plus catch-share upside during peak season.",
    },
  },
  {
    id: "lst_remote_community",
    title: "Remote Community Manager",
    category: "remote",
    location: "Remote · Worldwide",
    opportunityWindow: "Year-round",
    begins: "Rolling",
    status: "live",
    host: { name: "Driftwork Collective", verified: false, tier: "none", tagline: "Fully remote operations. Build community from anywhere — no office, no commute." },
    benefits: {
      housing: { provision: "not_provided", summary: "Not included" },
      meals: { provision: "not_provided", summary: "Not included" },
      pay: { provision: "provided", summary: "$24/hr" },
    },
    cover: {
      source: "curated",
      scope: "landscape",
      curatedPhotoId: "curated_remote_cabin_01",
      image: {
        masterPath: "curated/landscape/remote-cabin-01.jpg",
        width: 1200,
        height: 800,
        blurhash: "L9AwUL00~q9F00xu%MM{00Rj%MRj",
        alt: "Cozy cabin desk with a laptop overlooking pines",
      },
    },
    matchScore: 72,
    visaSupport: true,
    payInsight: {
      meterValue: 73,
      minCents: 2400,
      maxCents: 2400,
      unit: "hour",
      currency: "USD",
      note: "Stable remote hourly rate; housing and meals are handled separately.",
    },
  },
  {
    id: "lst_ski_resort_breck",
    title: "Ski Resort Front Desk",
    category: "seasonal",
    location: "Breckenridge, Colorado",
    coordinates: { lat: 39.4817, lon: -106.0384 },
    opportunityWindow: "Nov 2026–Apr 2027",
    begins: "Nov 14, 2026",
    ends: "Apr 18, 2027",
    status: "live",
    host: { name: "Summit Pass Hospitality", verified: true, tier: "professional", tagline: "Mountain resort operations in the Colorado Rockies. Ski season with dorm housing and cafeteria." },
    benefits: {
      housing: { provision: "provided", summary: "Staff dorm room" },
      meals: { provision: "partial", summary: "Staff cafeteria" },
      pay: { provision: "provided", summary: "$19/hr + tips" },
    },
    cover: {
      source: "uploaded",
      media: {
        id: "media_breck_cover",
        bucket: "cover_photo",
        masterPath: "listings/lst_ski_resort_breck/cover.jpg",
        width: 1200,
        height: 800,
        alt: "Snowy mountain resort exterior at dusk",
        sortOrder: 0,
      },
    },
    conditionalBadges: ["boosted"],
    founding: false,
    payInsight: {
      meterValue: 71,
      minCents: 1900,
      maxCents: 1900,
      unit: "hour",
      currency: "USD",
      note: "Solid hourly base with dorm housing and cafeteria access.",
    },
  },
  {
    id: "lst_eco_hostel_lisbon",
    title: "Eco-Hostel Allrounder",
    category: "mix",
    location: "Lisbon, Portugal",
    coordinates: { lat: 38.7223, lon: -9.1393 },
    opportunityWindow: "Flexible · 3+ months",
    begins: "Flexible",
    status: "live",
    host: { name: "Tejo Green House", verified: true, tier: "starter", tagline: "Lisbon eco-hostel life. Communal dinners, vibrant guests, private room included." },
    benefits: {
      housing: { provision: "provided", summary: "Private room" },
      meals: { provision: "provided", summary: "Communal dinner daily" },
      pay: { provision: "partial", summary: "Stipend + tips" },
    },
    cover: {
      source: "curated",
      scope: "landscape",
      curatedPhotoId: "curated_mix_hostel_01",
      image: {
        masterPath: "curated/landscape/mix-hostel-01.jpg",
        width: 1200,
        height: 800,
        blurhash: "LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
        alt: "Bright communal courtyard of a tiled eco-hostel",
      },
    },
    matchScore: 65,
    visaSupport: true,
    payInsight: {
      meterValue: 54,
      unit: "stipend",
      currency: "EUR",
      note: "Lower direct cash, offset by room and communal meals.",
    },
  },
  {
    id: "lst_vineyard_napa",
    title: "Vineyard Cellar Assistant",
    category: "farm",
    location: "Napa, California",
    coordinates: { lat: 38.2975, lon: -122.2869 },
    opportunityWindow: "Sep–Nov 2026",
    begins: "Sep 8, 2026",
    ends: "Nov 21, 2026",
    status: "live",
    host: { name: "Stone Hollow Vineyard", verified: false, tier: "none", tagline: "Boutique vineyard in Napa wine country. Harvest season under California sun." },
    benefits: {
      housing: { provision: "partial", summary: "Tent platform site" },
      meals: { provision: "not_provided", summary: "Not included" },
      pay: { provision: "provided", summary: "$20/hr" },
    },
    payInsight: {
      meterValue: 62,
      minCents: 2000,
      maxCents: 2000,
      unit: "hour",
      currency: "USD",
      note: "Strong hourly pay, but food and full housing are not included.",
    },
  },
  {
    // A SOURCED fixture (dev/preview only) so the sourced-card journey renders
    // without a backend: no host, source attribution, meals NOT STATED.
    id: "lst_sourced_kelp_farm",
    title: "Kelp Farm Field Technician",
    category: "maritime",
    location: "Kodiak, Alaska",
    coordinates: { lat: 57.79, lon: -152.407 },
    opportunityWindow: "May–Aug 2026",
    begins: "May 4, 2026",
    ends: "Aug 29, 2026",
    status: "live",
    // Sourced listings carry no host id, are never verified, and rank at "none".
    host: { name: "Kodiak Kelp Co.", verified: false, tier: "none" },
    benefits: {
      housing: { provision: "provided", summary: "Bunkhouse berth" },
      // Meals were NOT stated by the source — never shown as "not provided".
      meals: { provision: "not_provided", summary: "Not stated" },
      pay: { provision: "provided", summary: "$21/hr" },
    },
    provenanceInfo: {
      provenance: "sourced",
      claimStatus: "unclaimed",
      benefitEvidence: { housing: "stated", meals: "not_stated", pay: "stated" },
      source: {
        sourceName: "CoastWork",
        sourceUrl: "https://example.com/coastwork/kelp-tech-2026",
        sourcePostingId: "cw-kelp-2026",
        publishedAt: "2026-04-10T00:00:00Z",
        retrievedAt: "2026-07-12T00:00:00Z",
        employerName: "Kodiak Kelp Co.",
      },
    },
  },
];
