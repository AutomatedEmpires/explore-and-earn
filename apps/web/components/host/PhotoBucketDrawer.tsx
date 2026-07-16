"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { Button, Icon } from "@explore-and-earn/ui";
import {
	UPLOAD_ALLOWED_MIME_TYPES,
	type BenefitDetail,
	type EditableBenefitKind,
} from "@explore-and-earn/contracts";
import {
	getBenefitDetailsAction,
	saveBenefitDetailsAction,
	uploadBenefitPhotoAction,
} from "../../app/actions/benefitDetails";
import { PopupShell } from "../overlay/PopupShell";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PhotoBucketSlot {
	readonly id: string;
	readonly label: string;
}

export interface PhotoBucketDrawerProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly listingId: string;
	readonly kind: EditableBenefitKind;
	readonly title: string;
	readonly subtitle: string;
	readonly icon: "benefit.housing" | "benefit.meals";
	readonly saveLabel: string;
	readonly slots: readonly PhotoBucketSlot[];
	/** The owning drawer's CSS module — carries per-slot placeholder classes. */
	readonly styles: Record<string, string>;
}

// The non-photo parts of a saved BenefitDetail. The photo bucket only edits
// `photos`; we preserve everything else the host set in the listing editor so a
// bucket save can never wipe their housing/meals facts.
type BaseDetail = Omit<BenefitDetail, "photos">;

const EMPTY_BASE: BaseDetail = { fields: {}, toggles: {} };

// ── Component ────────────────────────────────────────────────────────────────

/**
 * The host's reusable photo BUCKET editor for one benefit kind. Fills a fixed
 * set of named slots; framed, never filtered. Photos are uploaded once and, by
 * design, reused across every listing the host posts (see the reuse note).
 *
 * Reuses the existing benefit-photo upload/save wiring — no new backend.
 */
export function PhotoBucketDrawer({
	open,
	onClose,
	listingId,
	kind,
	title,
	subtitle,
	icon,
	saveLabel,
	slots,
	styles,
}: PhotoBucketDrawerProps) {
	const [photos, setPhotos] = useState<Record<string, string>>({});
	const [base, setBase] = useState<BaseDetail>(EMPTY_BASE);
	const [hydrating, setHydrating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Hydrate from whatever the host already saved for this listing/kind.
	useEffect(() => {
		if (!open) return;
		setError(null);
		setPhotos({});
		setBase(EMPTY_BASE);
		if (!listingId) return;

		let cancelled = false;
		setHydrating(true);
		getBenefitDetailsAction(listingId)
			.then((res) => {
				if (cancelled) return;
				if (!res.ok) {
					setError("Could not load saved photos.");
					return;
				}
				const detail = res.details?.[kind];
				if (!detail) return;
				setPhotos({ ...detail.photos });
				setBase({
					fields: { ...detail.fields },
					toggles: { ...detail.toggles },
					...(detail.customChips ? { customChips: detail.customChips } : {}),
				});
			})
			.catch(() => {
				if (!cancelled) setError("Could not load saved photos.");
			})
			.finally(() => {
				if (!cancelled) setHydrating(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, listingId, kind]);

	async function handleSlotFile(slotId: string, file: File) {
		if (!listingId) return;
		setError(null);
		setUploadingSlot(slotId);
		try {
			const fd = new FormData();
			fd.append("file", file);
			const res = await uploadBenefitPhotoAction(listingId, kind, slotId, fd);
			if (res.ok && res.url) {
				const url = res.url;
				setPhotos((prev) => ({ ...prev, [slotId]: url }));
			} else {
				setError(res.error ?? "Upload failed. Please try again.");
			}
		} finally {
			setUploadingSlot(null);
		}
	}

	function removePhoto(slotId: string) {
		setPhotos((prev) => {
			const next = { ...prev };
			delete next[slotId];
			return next;
		});
	}

	async function handleSave() {
		if (!listingId) {
			setError("Save the listing first, then add photos.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const detail: BenefitDetail = { ...base, photos };
			const res = await saveBenefitDetailsAction(listingId, kind, detail);
			if (res.ok) onClose();
			else setError(res.error ?? "Could not save. Please try again.");
		} finally {
			setSaving(false);
		}
	}

	const footer = (
		<div className={styles.footerRow}>
			<Button variant="secondary" onClick={onClose} disabled={saving}>
				Cancel
			</Button>
			<Button
				variant="primary"
				className={styles.saveBtn}
				onClick={handleSave}
				disabled={saving || hydrating}
			>
				{saving ? "Saving…" : saveLabel}
			</Button>
		</div>
	);

	return (
		<PopupShell
			open={open}
			onClose={onClose}
			title={title}
			headerIcon={<Icon name={icon} size={24} aria-hidden />}
			footer={footer}
			size="wide"
			closeLabel={`Close ${title.toLowerCase()} photos`}
		>
			<p className={styles.subtitle}>{subtitle}</p>

			<section className={styles.photoSection} aria-label={`${title} photos`}>
				<div className={styles.photoGrid}>
					{slots.map((slot) => (
						<div
							key={slot.id}
							className={`${styles.photoSlot} ${styles[slot.id] ?? ""}`}
						>
							<div className={styles.photoArea}>
								{photos[slot.id] ? (
									<>
										<Image
											src={photos[slot.id]}
											alt={`${slot.label} photo`}
											fill
											sizes="(max-width: 639px) 45vw, 240px"
											className={styles.photoImg}
											unoptimized
										/>
										<button
											type="button"
											className={styles.removePhoto}
											onClick={() => removePhoto(slot.id)}
											aria-label={`Remove ${slot.label} photo`}
										>
											<Icon name="action.close" size={16} aria-hidden />
										</button>
									</>
								) : uploadingSlot === slot.id ? (
									<span
										className={styles.cameraButton}
										role="status"
										aria-label={`Uploading ${slot.label} photo`}
									>
										<span className={styles.spinner} aria-hidden />
									</span>
								) : (
									<>
										<input
											id={`pb-${kind}-${slot.id}`}
											type="file"
											accept={UPLOAD_ALLOWED_MIME_TYPES.join(",")}
											className={styles.fileInput}
											onChange={(e) => {
												const file = e.target.files?.[0];
												if (file) void handleSlotFile(slot.id, file);
												e.target.value = "";
											}}
										/>
										<label
											htmlFor={`pb-${kind}-${slot.id}`}
											className={styles.cameraButton}
											aria-label={`Upload ${slot.label} photo`}
										>
											<Icon name="nav.photos" size={16} aria-hidden />
										</label>
									</>
								)}
							</div>
							<span className={styles.slotLabel}>{slot.label.toUpperCase()}</span>
						</div>
					))}
				</div>
			</section>

			{error ? (
				<p className={styles.formError} role="alert">
					{error}
				</p>
			) : null}

			{/* Reuse note — the bucket uploads once and carries across listings. */}
			<div className={styles.trustNote} data-kind={kind} role="note">
				<span className={styles.trustIcon} aria-hidden>
					<Icon name="system.info" size={20} />
				</span>
				<p className={styles.trustText}>
					Upload once — these photos reuse across every listing you post.
				</p>
			</div>
		</PopupShell>
	);
}
