"use client";

import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The app-side cover renderer for DiscoveryCard (packages/ui stays
 * framework-agnostic; this threads next/image in via the renderCoverImage
 * prop). What it buys on every card surface:
 *   • real srcset/resizing through the Vercel image optimizer — host-uploaded
 *     Supabase covers previously shipped at STORED resolution to ~360px card
 *     slots (48 of them on /seek), the largest single slice of mobile page
 *     weight (production audit 2026-07-22);
 *   • `sizes` matched to the canonical DiscoveryFeed grid (1-col mobile,
 *     2-col ≥768px, 3-col ≥1024px), so browsers pick the smallest candidate.
 *
 * `fill` mirrors the .heroImg contract exactly (absolute inset, object-fit
 * cover via the passed className) inside the card's FIXED 16/10 aspect box —
 * sizing can never shift layout. Eager covers become `priority` (preload +
 * fetchpriority=high, matching the raw-img behavior they replace).
 */

const CARD_COVER_SIZES =
	"(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw";

export function renderCardCoverImage(cover: {
	readonly src: string;
	readonly alt: string;
	readonly className: string;
	readonly loading: "eager" | "lazy";
	readonly fetchPriority?: "high";
}): ReactNode {
	const eager = cover.fetchPriority === "high" || cover.loading === "eager";
	return (
		<Image
			src={cover.src}
			alt={cover.alt}
			fill
			className={cover.className}
			sizes={CARD_COVER_SIZES}
			{...(eager ? { priority: true } : { loading: "lazy" as const })}
		/>
	);
}
