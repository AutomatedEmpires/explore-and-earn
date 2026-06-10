const CLOUD = "dwiwyt9vi"
const BASE = `https://res.cloudinary.com/${CLOUD}`

export type PhotoSize = "thumb" | "card" | "hero" | "full" | "og" | "sq-sm" | "sq-md"
export type PhotoCategory = "farm" | "maritime" | "remote" | "seasonal" | "encouragement"

/**
 * Returns a Cloudinary delivery URL for a curated landscape photo.
 *
 * @param category  Photo category bucket (farm / maritime / remote / seasonal / encouragement)
 * @param slug      The Unsplash photographer slug used as the public ID
 * @param size      Named transformation variant (default: "card")
 *
 * @example
 * cloudinaryPhoto("farm", "annie-spratt-jmjnnq2xfoy", "hero")
 * // → https://res.cloudinary.com/dwiwyt9vi/image/upload/t_ee-hero/explore-and-earn/photos/farm/landscape/annie-spratt-jmjnnq2xfoy
 */
export function cloudinaryPhoto(
  category: PhotoCategory,
  slug: string,
  size: PhotoSize = "card"
): string {
  const folder =
    category === "encouragement"
      ? `explore-and-earn/photos/encouragement`
      : `explore-and-earn/photos/${category}/landscape`
  return `${BASE}/image/upload/t_ee-${size}/${folder}/${slug}`
}

/**
 * Returns a Cloudinary delivery URL for a raw SVG (illustration or element).
 */
export function cloudinaryIllustration(slug: string): string {
  return `${BASE}/raw/upload/explore-and-earn/illustrations/${slug}`
}

export function cloudinaryElement(slug: string): string {
  return `${BASE}/raw/upload/explore-and-earn/elements/${slug}`
}

/**
 * Returns a srcSet string for a curated photo at 1× and 2× density.
 * Uses `t_ee-card` at 640w and `t_ee-hero` at 1280w by default.
 */
export function cloudinaryPhotoSrcSet(
  category: PhotoCategory,
  slug: string,
  sizes: [PhotoSize, number][] = [
    ["thumb", 320],
    ["card", 640],
    ["hero", 1280],
    ["full", 1920],
  ]
): string {
  return sizes
    .map(([size, w]) => `${cloudinaryPhoto(category, slug, size)} ${w}w`)
    .join(", ")
}
