import type { DiscoveryListing } from "./listing";

/**
 * Typed Discovery fixtures — NO backend (Sprint Zero). Every entry conforms to
 * the local DiscoveryListing view-model, which is composed from the frozen
 * @explore-and-earn/contracts registries. These drive the feed until the data
 * layer + Listing contract land.
 */
export const DISCOVERY_FIXTURES: readonly DiscoveryListing[] = [
  {
    id: "lst_orchard_wenatchee",
    title: "Orchard Harvest Hand",
    category: "farm",
    location: "Wenatchee, Washington",
    opportunityWindow: "Aug–Oct 2026",
    status: "live",
    host: { name: "Cascade Bloom Orchards", verified: true },
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
    conditionalBadges: ["seasonal"],
    matchScore: 88,
    founding: true,
  },
  {
    id: "lst_deckhand_sitka",
    title: "Deckhand — Salmon Season",
    category: "maritime",
    location: "Sitka, Alaska",
    opportunityWindow: "Jun–Aug 2026",
    status: "live",
    host: { name: "North Pacific Fisheries Co-op", verified: true },
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
    conditionalBadges: ["featured"],
    founding: false,
  },
  {
    id: "lst_remote_community",
    title: "Remote Community Manager",
    category: "remote",
    location: "Remote · Worldwide",
    opportunityWindow: "Year-round",
    status: "live",
    host: { name: "Driftwork Collective", verified: false },
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
  },
  {
    id: "lst_ski_resort_breck",
    title: "Ski Resort Front Desk",
    category: "seasonal",
    location: "Breckenridge, Colorado",
    opportunityWindow: "Nov 2026–Apr 2027",
    status: "live",
    host: { name: "Summit Pass Hospitality", verified: true },
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
    conditionalBadges: ["seasonal", "boosted"],
    founding: false,
  },
  {
    id: "lst_eco_hostel_lisbon",
    title: "Eco-Hostel Allrounder",
    category: "mix",
    location: "Lisbon, Portugal",
    opportunityWindow: "Flexible · 3+ months",
    status: "live",
    host: { name: "Tejo Green House", verified: true },
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
  },
  {
    id: "lst_vineyard_napa",
    title: "Vineyard Cellar Assistant",
    category: "farm",
    location: "Napa, California",
    opportunityWindow: "Sep–Nov 2026",
    status: "live",
    host: { name: "Stone Hollow Vineyard", verified: false },
    benefits: {
      housing: { provision: "partial", summary: "Tent platform site" },
      meals: { provision: "not_provided", summary: "Not included" },
      pay: { provision: "provided", summary: "$20/hr" },
    },
  },
];
