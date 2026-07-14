// Public Agent API v1 — versioned, read-only contracts over LIVE public
// inventory, served by /api/public/v1/* and the public MCP server (which share
// one service layer; RFC 2026-07-14 §1).
//
// STABILITY: these are external contracts. Fields are added, never renamed or
// removed, within v1. Codes (categories, provisions, precision) are stable
// machine values; presentation/localization happens client-side.
//
// PRIVACY: only live listings and public host fields ever map into these
// shapes. No seeker data, applicant data, drafts, moderation fields, internal
// match weights, notes, billing, or auth metadata — the DTO key sets are
// pinned by tests so a leak is a build failure, not a code review hope.
//
// HONESTY: absent facts are null/omitted, never placeholder values.

import type { GeoPoint, GeoPrecision } from "./geo"

export const PUBLIC_API_VERSION = "v1"

/** The four primary categories plus the mixed-work lane (locked enums.ts). */
export type PublicCategoryV1 = "farm" | "maritime" | "remote" | "seasonal" | "mix"

/* ---------------------------------------------------------------- listings */

export interface PublicListingLocationV1 {
	/** Honest precision indicator — see contracts/geo.ts. */
	readonly precision: GeoPrecision
	/** Free-text place label as the host entered it (null when unspecified). */
	readonly label: string | null
	/** Point coordinates when the listing has them (public by design). */
	readonly point: GeoPoint | null
}

export interface PublicListingPayV1 {
	/** Integer cents; null when the listing does not state pay. */
	readonly minCents: number | null
	readonly maxCents: number | null
	/** 'hour' | 'day' | 'week' | 'month' | 'stipend' | 'exchange' | 'other' | null. */
	readonly unit: string | null
	/** ISO 4217 currency for the cents fields. */
	readonly currency: string
	/** Host-authored summary ("$18–22/hr + tips"), null when absent. */
	readonly summary: string | null
}

/** The HOUSING / MEALS / PAY triad — first-class, never "perks". */
export interface PublicListingBenefitsV1 {
	readonly housing: { readonly included: boolean; readonly details: string | null }
	readonly meals: { readonly included: boolean; readonly details: string | null }
	readonly pay: PublicListingPayV1
}

export interface PublicListingSummaryV1 {
	/** Public listing id — the same id used in canonical /listing/{id} URLs. */
	readonly id: string
	/** Canonical public URL for citation/linking. */
	readonly url: string
	readonly title: string
	readonly category: PublicCategoryV1
	readonly location: PublicListingLocationV1
	readonly benefits: PublicListingBenefitsV1
	/** ISO timestamps; null = the listing does not state dates (open season). */
	readonly beginsAt: string | null
	readonly endsAt: string | null
	readonly publishedAt: string | null
	readonly coverPhotoUrl: string | null
	/** Public organization id (null for unattributed inventory). */
	readonly organizationId: string | null
	readonly organizationName: string | null
	/** Whether visa support is offered. */
	readonly visaSupport: boolean
}

export interface PublicListingDetailV1 extends PublicListingSummaryV1 {
	readonly description: string | null
	readonly galleryPhotoUrls: readonly string[]
}

/* ----------------------------------------------------------- organizations */

export interface PublicOrganizationV1 {
	readonly id: string
	/** Canonical public URL (/host/{id}). */
	readonly url: string
	readonly name: string
	readonly tagline: string | null
	readonly about: string | null
	readonly primaryLocationName: string | null
	readonly photoUrl: string | null
	readonly websiteUrl: string | null
	readonly categories: readonly PublicCategoryV1[]
	/** Active-paid-subscription verification badge (existing product rule). */
	readonly verified: boolean
	readonly memberSince: string | null
	/** Count of currently live listings. */
	readonly liveListingCount: number
}

/* ----------------------------------------------------------------- queries */

/** Validated search input for the public listings surface. */
export interface PublicListingQueryV1 {
	readonly query?: string
	readonly category?: PublicCategoryV1
	readonly housing?: boolean
	readonly meals?: boolean
	readonly visaSupport?: boolean
	/** Whole-dollar pay floor (matched against listing min pay). */
	readonly minPay?: number
	/** Substring place filter against the location label. */
	readonly place?: string
	/** Listings starting on/after this ISO date. */
	readonly startAfter?: string
	/** Listings starting on/before this ISO date. */
	readonly startBefore?: string
	/** Geographic bounding box (see contracts/geo.ts). */
	readonly bounds?: import("./geo").GeoBounds
	/** Page size, 1–100 (default 24). */
	readonly limit?: number
	/** Opaque cursor from a previous response. */
	readonly cursor?: string
}

export const PUBLIC_API_DEFAULT_PAGE_SIZE = 24
export const PUBLIC_API_MAX_PAGE_SIZE = 100

/* ------------------------------------------------------------------ cursor */

// Opaque offset cursor (base64url "o:<n>"). Deliberately versioned inside the
// string so a future keyset cursor can coexist; consumers must treat it as
// opaque.

export function encodePublicCursor(offset: number): string {
	const raw = `o:${Math.max(0, Math.floor(offset))}`
	// btoa is unavailable in Node <20 edge cases; Buffer is fine server-side,
	// but contracts must stay runtime-agnostic — hand-roll base64url over ASCII.
	if (typeof Buffer !== "undefined") {
		return Buffer.from(raw, "utf8").toString("base64url")
	}
	return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Returns the offset, or null for a missing/invalid cursor (caller rejects). */
export function decodePublicCursor(cursor: string | undefined): number | null {
	if (cursor === undefined) return 0
	if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 64) {
		return null
	}
	try {
		const raw =
			typeof Buffer !== "undefined"
				? Buffer.from(cursor, "base64url").toString("utf8")
				: atob(cursor.replace(/-/g, "+").replace(/_/g, "/"))
		const match = /^o:(\d{1,7})$/.exec(raw)
		if (!match) return null
		return Number.parseInt(match[1], 10)
	} catch {
		return null
	}
}
