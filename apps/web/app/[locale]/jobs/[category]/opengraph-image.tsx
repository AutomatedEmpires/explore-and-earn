import { ImageResponse } from "next/og";

import {
	CATEGORY_LANDING,
	isLandingCategory,
	type LandingCategory,
} from "../../../../lib/categoryLanding";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
	"Explore & Earn — seasonal jobs with housing, meals & pay upfront";

/**
 * Per-lane share card for /jobs/{lane} — the four highest-value SEO landings.
 * ImageResponse cannot read CSS custom properties, so the lane gradients and
 * ink values below restate the LIGHT-theme --cat-{lane}-cover and --palette-*
 * stops from styles/tokens.css verbatim (same pattern as app/opengraph-image
 * .tsx; this file carries its own raw-color baseline entry for G50).
 */
const INK = "#101E29";
const WHITE = "#FFFFFF";

const LANE_GRADIENT: Record<LandingCategory, string> = {
	farm: "linear-gradient(145deg, #3FA588 0%, #7FC9B2 50%, #B0E0D0 100%)",
	maritime: "linear-gradient(145deg, #2A7EB0 0%, #6BAAD6 50%, #A6D0EC 100%)",
	remote: "linear-gradient(145deg, #46617A 0%, #7C97AE 50%, #B0C4D4 100%)",
	seasonal: "linear-gradient(145deg, #1786A0 0%, #5FB6C6 50%, #A4DCE4 100%)",
};

export default async function OgImage({
	params,
}: {
	params: Promise<{ category: string }>;
}) {
	const { category } = await params;
	const lane: LandingCategory = isLandingCategory(category) ? category : "farm";
	const copy = CATEGORY_LANDING[lane];

	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					background: LANE_GRADIENT[lane],
				}}
			>
				{/* Ink panel over the lane atmosphere — mirrors the site's hero scrim. */}
				<div
					style={{
						marginTop: "auto",
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-start",
						padding: "56px 96px 64px",
						background: `linear-gradient(180deg, ${INK}00 0%, ${INK}E6 26%, ${INK} 100%)`,
					}}
				>
					{/* Triad badges */}
					<div style={{ display: "flex", gap: 16, marginBottom: 36 }}>
						{["Housing", "Meals", "Pay"].map((label) => (
							<div
								key={label}
								style={{
									background: WHITE,
									color: INK,
									fontSize: 18,
									fontFamily: "system-ui, sans-serif",
									fontWeight: 600,
									letterSpacing: "0.08em",
									textTransform: "uppercase",
									padding: "8px 20px",
									borderRadius: 4,
								}}
							>
								{label}
							</div>
						))}
					</div>

					{/* Lane headline — the founder H1 verbatim */}
					<div
						style={{
							fontSize: 64,
							fontWeight: 700,
							color: WHITE,
							lineHeight: 1.08,
							letterSpacing: "-0.02em",
							marginBottom: 20,
							fontFamily: "Georgia, 'Times New Roman', serif",
							maxWidth: 980,
						}}
					>
						{copy.title}
					</div>

					{/* Lane blurb — founder copy, carries the sub-role breadth */}
					<div
						style={{
							fontSize: 28,
							color: "#C8D5E3",
							fontFamily: "system-ui, sans-serif",
							fontWeight: 400,
							lineHeight: 1.4,
							marginBottom: 36,
						}}
					>
						{copy.blurb}
					</div>

					<div
						style={{
							fontSize: 22,
							color: "#7A8E9E",
							fontFamily: "system-ui, sans-serif",
							letterSpacing: "0.02em",
						}}
					>
						exploreandearn.com
					</div>
				</div>
			</div>
		),
		{ ...size },
	);
}
