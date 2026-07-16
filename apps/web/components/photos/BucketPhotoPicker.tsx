"use client";

import { useRef } from "react";
import Image from "next/image";

import { Icon, type PhotoSize } from "@explore-and-earn/ui";
import {
	bucketPhotos,
	bucketPhotoUrl,
	getBucket,
	type BucketId,
	type ResolvedBucketPhoto,
} from "../../lib/photoBuckets";
import styles from "./BucketPhotoPicker.module.css";

const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp";

export interface BucketPhotoPickerProps {
	/** Which of the nine buckets to offer as presets. */
	readonly bucketId: BucketId;
	/** Currently-selected value — a Cloudinary public ID or an upload URL. */
	readonly value?: string | null;
	/** Called when the user picks a preset (passes the Cloudinary public ID). */
	readonly onSelectPreset?: (publicId: string) => void;
	/** Called when the user uploads their own — the PRIMARY path. */
	readonly onUpload?: (file: File) => void;
	/** Called to clear the current selection, if removable. */
	readonly onRemove?: () => void;
	readonly uploading?: boolean;
	readonly uploadLabel?: string;
	readonly presetLabel?: string;
	/** Named Cloudinary size for the preset tiles (default "card"). */
	readonly size?: PhotoSize;
}

/**
 * BucketPhotoPicker — the ONE reusable photo-selection primitive shared across
 * roles (seeker cover/icon · host cover/logo/housing/meals · admin cover/profile).
 *
 * Upload-your-own is the PRIMARY affordance; picking from the relevant bucket is
 * the fallback. It reads presets from the typed `photoBuckets` config (the single
 * source of truth) and NEVER renders a fabricated image — "to populate" slots are
 * simply absent from the preset grid, so an empty bucket shows only the upload
 * path plus an honest "presets coming soon" hint.
 *
 * Presentational + role-agnostic: it emits `onUpload` / `onSelectPreset` and lets
 * the caller own persistence, so it drops into a modal (cover/logo pickers) or a
 * page (admin manager) unchanged.
 */
export function BucketPhotoPicker({
	bucketId,
	value,
	onSelectPreset,
	onUpload,
	onRemove,
	uploading = false,
	uploadLabel,
	presetLabel = "Or pick from the library",
	size = "card",
}: BucketPhotoPickerProps) {
	const fileRef = useRef<HTMLInputElement>(null);
	const bucket = getBucket(bucketId);
	const presets = bucketPhotos(bucketId);
	const hasPresets = presets.length > 0;
	// Group presets by their section label so partitioned buckets (housing,
	// meals, host profile) read as their categories.
	const grouped = presets.reduce<Record<string, ResolvedBucketPhoto[]>>(
		(acc, p) => {
			(acc[p.section] ??= []).push(p);
			return acc;
		},
		{},
	);
	const sections = Object.entries(grouped);

	return (
		<div className={styles.root}>
			{/* Upload — the primary path */}
			{onUpload ? (
				<div className={styles.uploadRow}>
					<input
						ref={fileRef}
						type="file"
						accept={UPLOAD_ACCEPT}
						className={styles.fileInput}
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) onUpload(file);
							e.target.value = "";
						}}
					/>
					<button
						type="button"
						className={styles.uploadBtn}
						onClick={() => fileRef.current?.click()}
						disabled={uploading}
					>
						<Icon name="nav.photos" size={20} aria-hidden />
						{uploading
							? "Uploading…"
							: (uploadLabel ?? "Upload your own photo")}
					</button>
					<p className={styles.uploadHint}>Your own photo looks best.</p>
				</div>
			) : null}

			{/* Preset grid — the fallback path */}
			<p className={styles.sectionLabel}>{presetLabel}</p>
			{hasPresets ? (
				<div className={styles.sections}>
					{sections.map(([label, items]) => (
						<div key={label} className={styles.section}>
							{sections.length > 1 ? (
								<span className={styles.groupLabel}>{label}</span>
							) : null}
							<div className={styles.grid}>
								{items.map((opt) => {
									// `value` may be a raw public ID or a full delivery URL
									// (any transform) — match either so the selected ring
									// shows regardless of which the caller stores.
									const selected =
										value != null &&
										(value === opt.publicId || value.includes(opt.publicId));
									return (
										<button
											key={opt.id}
											type="button"
											className={`${styles.swatch} ${selected ? styles.swatchSelected : ""}`}
											onClick={() => onSelectPreset?.(opt.publicId)}
											aria-label={opt.label}
											aria-pressed={selected}
										>
											<Image
												src={bucketPhotoUrl(opt.publicId, size)}
												alt=""
												fill
												sizes="(max-width: 640px) 33vw, 170px"
												className={styles.swatchImg}
											/>
											<span className={styles.swatchLabel}>{opt.label}</span>
										</button>
									);
								})}
							</div>
						</div>
					))}
				</div>
			) : (
				<p className={styles.emptyHint} role="note">
					<Icon name="system.info" size={16} aria-hidden />
					<span>
						Library presets for {bucket.label.toLowerCase()} are coming soon —
						upload your own for now.
					</span>
				</p>
			)}

			{value && onRemove ? (
				<button type="button" className={styles.removeBtn} onClick={onRemove}>
					Remove selection
				</button>
			) : null}
		</div>
	);
}
