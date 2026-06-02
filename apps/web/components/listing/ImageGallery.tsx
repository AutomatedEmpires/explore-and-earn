import type { CSSProperties } from "react"
import type { ListingMedia } from "@explore-and-earn/contracts"

const galleryStyle: CSSProperties = {
	display: "flex",
	gap: "var(--space-8)",
	overflowX: "auto",
	scrollSnapType: "x mandatory",
	borderRadius: "var(--radius-image)",
}

const figureStyle: CSSProperties = {
	margin: "0",
	flex: "0 0 100%",
	scrollSnapAlign: "center",
}

const imageStyle: CSSProperties = {
	display: "block",
	width: "100%",
	height: "auto",
	aspectRatio: "4 / 3",
	objectFit: "cover",
	borderRadius: "var(--radius-image)",
	background: "var(--color-surface)",
}

export function ImageGallery({
	images,
	title,
}: {
	readonly images: ReadonlyArray<ListingMedia>
	readonly title: string
}) {
	if (images.length === 0) {
		return null
	}
	return (
		<div role="group" aria-label={`Photos of ${title}`} style={galleryStyle}>
			{images.map((image) => (
				<figure key={image.id} style={figureStyle}>
					<img
						src={image.masterPath}
						alt={image.alt}
						width={image.width}
						height={image.height}
						style={imageStyle}
					/>
				</figure>
			))}
		</div>
	)
}
