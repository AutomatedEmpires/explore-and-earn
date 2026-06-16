/**
 * Element registry — small decorative accents (sparkles, leaves, compass, dividers).
 * Rendered by <AppElement>. Elements are ALWAYS decorative (aria-hidden) and never
 * load-bearing for meaning.
 *
 * Two delivery kinds:
 *   - source "streamline": a real Cloudinary SVG (verified id), tinted via currentColor.
 *   - source "css-primitive": NOT a Streamline asset — rendered from pure CSS by
 *     <AppElement>. Used for marks no single glyph captures (hand-drawn divider,
 *     card corner mat, paper grain). Flagged honestly so the registry never implies
 *     an asset that doesn't exist.
 */

import type { VisualAssetEntry } from "./types"

export type ElementKey =
	// streamline motifs
	| "accent.sparkle"
	| "accent.leaf"
	| "accent.compass"
	| "accent.sun"
	| "accent.cloud"
	| "accent.feather"
	| "accent.starPin"
	| "accent.heartPin"
	| "accent.tree"
	| "accent.road"
	| "accent.flag"
	| "accent.peace"
	| "accent.seasonalTree"
	// css primitives
	| "mark.divider"
	| "mark.cornerAccent"
	| "mark.paperTexture"

export type ElementEntry = VisualAssetEntry<ElementKey>

export const ELEMENT_REGISTRY: Record<ElementKey, ElementEntry> = {
	"accent.sparkle": {
		key: "accent.sparkle",
		label: "Sparkle",
		description: "Featured / premium flourish (replaces ad-hoc ✦).",
		category: "accent",
		streamline: "sparkles",
		keywords: ["sparkle", "shine", "featured", "premium", "star"],
		cloudinaryId: "Sparkles-2--Streamline-Freehand_q0yfrx",
		source: "streamline",
		decorative: true,
	},
	"accent.leaf": {
		key: "accent.leaf",
		label: "Leaf",
		description: "Organic / farm / seasonal accent.",
		category: "accent",
		streamline: "plant leaf",
		keywords: ["leaf", "plant", "farm", "seasonal", "nature"],
		cloudinaryId: "Plant-Leaf--Streamline-Freehand_toycsh",
		source: "streamline",
		decorative: true,
	},
	"accent.compass": {
		key: "accent.compass",
		label: "Compass",
		description: "Explore / discovery / travel accent.",
		category: "accent",
		streamline: "compass",
		keywords: ["compass", "explore", "discover", "travel", "adventure"],
		cloudinaryId: "Compass--Streamline-Freehand_xsrusn",
		source: "streamline",
		decorative: true,
	},
	"accent.sun": {
		key: "accent.sun",
		label: "Sun",
		description: "Warm / seasonal / sky accent.",
		category: "accent",
		streamline: "sunny",
		keywords: ["sun", "sunny", "warm", "sky", "seasonal"],
		cloudinaryId: "Weather-Sunny--Streamline-Freehand_zftj7y",
		source: "streamline",
		decorative: true,
	},
	"accent.cloud": {
		key: "accent.cloud",
		label: "Cloud",
		description: "Sky / atmosphere accent.",
		category: "accent",
		streamline: "cloud",
		keywords: ["cloud", "sky", "weather", "atmosphere"],
		cloudinaryId: "Weather-Cloud--Streamline-Freehand_todtke",
		source: "streamline",
		decorative: true,
	},
	"accent.feather": {
		key: "accent.feather",
		label: "Feather",
		description: "Light / hand-drawn flourish.",
		category: "accent",
		streamline: "peacock feather",
		keywords: ["feather", "light", "flourish", "quill"],
		cloudinaryId: "Peacock-Feather--Streamline-Freehand_fjwzup",
		source: "streamline",
		decorative: true,
	},
	"accent.starPin": {
		key: "accent.starPin",
		label: "Star pin",
		description: "Featured / boosted badge flourish.",
		category: "accent",
		streamline: "star pin",
		keywords: ["star", "featured", "boosted", "pin", "badge"],
		cloudinaryId: "Pin-Star--Streamline-Freehand_tq0bkh",
		source: "streamline",
		decorative: true,
	},
	"accent.heartPin": {
		key: "accent.heartPin",
		label: "Heart pin",
		description: "Saved / loved flourish.",
		category: "accent",
		streamline: "heart pin",
		keywords: ["heart", "saved", "love", "pin"],
		cloudinaryId: "Style-Three-Pin-Heart--Streamline-Freehand_hzjmax",
		source: "streamline",
		decorative: true,
	},
	"accent.tree": {
		key: "accent.tree",
		label: "Tree",
		description: "Outdoors / growth accent.",
		category: "accent",
		streamline: "growing tree",
		keywords: ["tree", "growth", "outdoors", "nature"],
		cloudinaryId: "Organic-Tree-Grow-1--Streamline-Freehand_pjpicy",
		source: "streamline",
		decorative: true,
	},
	"accent.road": {
		key: "accent.road",
		label: "Road",
		description: "Journey / travel accent.",
		category: "accent",
		streamline: "straight road",
		keywords: ["road", "journey", "travel", "path"],
		cloudinaryId: "Road-Straight-1--Streamline-Freehand_bykzs7",
		source: "streamline",
		decorative: true,
	},
	"accent.flag": {
		key: "accent.flag",
		label: "Flag",
		description: "Goal / milestone accent.",
		category: "accent",
		streamline: "waving flag",
		keywords: ["flag", "goal", "milestone", "marker"],
		cloudinaryId: "Flag-Plain-Wave-2--Streamline-Freehand_db4ezc",
		source: "streamline",
		decorative: true,
	},
	"accent.peace": {
		key: "accent.peace",
		label: "Peace",
		description: "Calm / community accent.",
		category: "accent",
		streamline: "peace mood",
		keywords: ["peace", "calm", "community", "good vibes"],
		cloudinaryId: "Mood-Peace--Streamline-Freehand_j9kedd",
		source: "streamline",
		decorative: true,
	},
	"accent.seasonalTree": {
		key: "accent.seasonalTree",
		label: "Seasonal tree",
		description: "Winter / holiday seasonal accent.",
		category: "accent",
		streamline: "christmas tree",
		keywords: ["tree", "winter", "holiday", "seasonal"],
		cloudinaryId: "Tree-Christmas--Streamline-Freehand_d39csj",
		source: "streamline",
		decorative: true,
	},
	"mark.divider": {
		key: "mark.divider",
		label: "Divider",
		description: "Hand-drawn horizontal rule (CSS primitive).",
		category: "divider",
		streamline: "n/a — CSS hand-drawn rule",
		keywords: ["divider", "rule", "separator", "line"],
		source: "css-primitive",
		decorative: true,
	},
	"mark.cornerAccent": {
		key: "mark.cornerAccent",
		label: "Corner accent",
		description: "Paper-mat corner tick for cards (CSS primitive).",
		category: "accent",
		streamline: "n/a — CSS corner mat",
		keywords: ["corner", "accent", "card", "mat"],
		source: "css-primitive",
		decorative: true,
	},
	"mark.paperTexture": {
		key: "mark.paperTexture",
		label: "Paper texture",
		description: "Subtle paper-grain background wash (CSS primitive).",
		category: "background",
		streamline: "n/a — CSS paper grain",
		keywords: ["paper", "texture", "grain", "background"],
		source: "css-primitive",
		decorative: true,
	},
}

/** Ordered list of every element key (kept in sync with the union by the type-test). */
export const ELEMENT_KEYS = [
	"accent.sparkle",
	"accent.leaf",
	"accent.compass",
	"accent.sun",
	"accent.cloud",
	"accent.feather",
	"accent.starPin",
	"accent.heartPin",
	"accent.tree",
	"accent.road",
	"accent.flag",
	"accent.peace",
	"accent.seasonalTree",
	"mark.divider",
	"mark.cornerAccent",
	"mark.paperTexture",
] as const satisfies readonly ElementKey[]

/** Resolve an element entry by key. */
export function getElement(key: ElementKey): ElementEntry {
	return ELEMENT_REGISTRY[key]
}
