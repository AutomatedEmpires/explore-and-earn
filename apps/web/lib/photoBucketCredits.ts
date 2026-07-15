/**
 * Photo-bucket attribution — Unsplash source credits for seeded imagery.
 * ---------------------------------------------------------------------------
 * The Unsplash License does NOT require attribution, but we keep it: cheap
 * goodwill and it seeds a future /credits page. Generated from the seed run
 * (scripts/seed-photo-buckets.mjs); append new rows as more buckets are seeded.
 * Only people-safe, delivery-verified assets are listed.
 */

export interface PhotoCredit {
	readonly publicId: string;
	readonly photographer: string;
	readonly photographerUrl: string;
	readonly unsplashUrl: string;
	readonly source: "unsplash";
}

export const PHOTO_BUCKET_CREDITS: readonly PhotoCredit[] = [
  {
    "publicId": "ee/buckets/housing/bedrooms/marcus-loke-WQJvWU_HZFo",
    "photographer": "Marcus Loke",
    "photographerUrl": "https://unsplash.com/@marcusloke",
    "unsplashUrl": "https://unsplash.com/photos/black-metal-bunk-bed-WQJvWU_HZFo",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/housing/bedrooms/zoshua-colah-TzMGehZmocI",
    "photographer": "Zoshua Colah",
    "photographerUrl": "https://unsplash.com/@zoshuacolah",
    "unsplashUrl": "https://unsplash.com/photos/a-room-filled-with-lots-of-bunk-beds-next-to-a-window-TzMGehZmocI",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/housing/bathrooms/carlos-masias-yg8zkwBS30Q",
    "photographer": "Carlos Masias",
    "photographerUrl": "https://unsplash.com/@csebastian_",
    "unsplashUrl": "https://unsplash.com/photos/a-bathroom-with-a-tub-sink-and-mirror-yg8zkwBS30Q",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/housing/bathrooms/steven-ungermann-Aac7IlKnYX8",
    "photographer": "Steven Ungermann",
    "photographerUrl": "https://unsplash.com/@steveungermann",
    "unsplashUrl": "https://unsplash.com/photos/white-ceramic-bathtub-near-green-potted-plant-Aac7IlKnYX8",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/housing/exteriors/troy-mortier-AmGQi4pF_lE",
    "photographer": "Troy Mortier",
    "photographerUrl": "https://unsplash.com/@troyscanon",
    "unsplashUrl": "https://unsplash.com/photos/several-houses-under-construction-with-wooden-frames-AmGQi4pF_lE",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/housing/exteriors/dmytro-koplyk-8xAu_SSpMPQ",
    "photographer": "Dmytro Koplyk",
    "photographerUrl": "https://unsplash.com/@dkoplyk",
    "unsplashUrl": "https://unsplash.com/photos/a-window-cleaner-rappelling-down-a-modern-high-rise-building-8xAu_SSpMPQ",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/meals/meals/ella-olsson-ZjEeMnDiq00",
    "photographer": "Ella Olsson",
    "photographerUrl": "https://unsplash.com/@ellaolsson",
    "unsplashUrl": "https://unsplash.com/photos/cooked-food-on-plate-ZjEeMnDiq00",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/meals/kitchens/zhang-ziyu-2VX0f47Z5NA",
    "photographer": "Zhang Ziyu",
    "photographerUrl": "https://unsplash.com/@rs1497",
    "unsplashUrl": "https://unsplash.com/photos/coffee-bar-with-espresso-machines-and-a-polo-shirt-2VX0f47Z5NA",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/meals/kitchens/luk-parni-an-HZgSvndfakc",
    "photographer": "Lukáš Parničan",
    "photographerUrl": "https://unsplash.com/@lukasparnican",
    "unsplashUrl": "https://unsplash.com/photos/modern-kitchen-sink-with-white-cabinets-and-countertop-HZgSvndfakc",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/meals/dining/bruno-ngarukiye-OqFZPMeufYQ",
    "photographer": "Bruno Ngarukiye",
    "photographerUrl": "https://unsplash.com/@itsbrunoagain",
    "unsplashUrl": "https://unsplash.com/photos/outdoor-dining-table-set-for-a-party-with-floral-decorations-OqFZPMeufYQ",
    "source": "unsplash"
  },
  {
    "publicId": "ee/buckets/meals/misc/vije-vijendranath-26LFdL8exMo",
    "photographer": "Vije Vijendranath",
    "photographerUrl": "https://unsplash.com/@vijev",
    "unsplashUrl": "https://unsplash.com/photos/red-and-yellow-tomatoes-in-brown-woven-basket-26LFdL8exMo",
    "source": "unsplash"
  }
];

/** Credit for a bucket public ID, or null when none is recorded. */
export function creditFor(publicId: string): PhotoCredit | null {
	return PHOTO_BUCKET_CREDITS.find((c) => c.publicId === publicId) ?? null;
}
