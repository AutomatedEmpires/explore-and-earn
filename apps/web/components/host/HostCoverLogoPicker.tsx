"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";

import { Button, Icon } from "@explore-and-earn/ui";
import {
	curatedCovers,
	curatedLogos,
	isPhotoCover,
	type CuratedCover,
	type CuratedLogo,
} from "../../lib/curatedPhotos";
import { PopupShell } from "../overlay/PopupShell";
import styles from "./HostCoverLogoPicker.module.css";

export interface HostCoverLogoPickerProps {
	readonly companyName: string;
	readonly coverUrl: string | null;
	readonly logoUrl: string | null;
}

type Mode = "cover" | "logo" | null;

// Host scope — cover and logo are always SEPARATE sets, distinct from seeker
// and admin. Predefined-or-upload; uploading your own is preferred.
const HOST_COVERS = curatedCovers("host");
const HOST_LOGOS = curatedLogos("host");

function initial(name: string): string {
	const c = name.trim().charAt(0);
	return c ? c.toUpperCase() : "•";
}

/**
 * The host's cover + logo photo picker. Two affordances (Cover / Logo), each
 * opening a predefined-or-upload chooser. Selection is a live preview in this
 * shell — no cover/logo persistence backend is wired here, so an upload sets a
 * local preview URL rather than posting to a server.
 */
export function HostCoverLogoPicker({
	companyName,
	coverUrl,
	logoUrl,
}: HostCoverLogoPickerProps) {
	const [mode, setMode] = useState<Mode>(null);
	const [coverPreview, setCoverPreview] = useState<CuratedCover | null>(null);
	const [coverUpload, setCoverUpload] = useState<string | null>(null);
	const [logoPreview, setLogoPreview] = useState<CuratedLogo | null>(null);
	const [logoUpload, setLogoUpload] = useState<string | null>(null);
	const uploadRef = useRef<HTMLInputElement>(null);

	const close = useCallback(() => setMode(null), []);

	const handleUpload = useCallback(
		(file: File) => {
			const url = URL.createObjectURL(file);
			if (mode === "cover") {
				setCoverUpload((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return url;
				});
				setCoverPreview(null);
			} else if (mode === "logo") {
				setLogoUpload((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return url;
				});
				setLogoPreview(null);
			}
		},
		[mode],
	);

	const isCover = mode === "cover";
	const monogram = initial(companyName);

	// Resolve the current preview for the open chooser's hero strip.
	const coverPreviewValue = coverUpload ?? coverPreview?.value ?? coverUrl;
	const coverPreviewIsPhoto = coverUpload
		? true
		: coverPreview
			? isPhotoCover(coverPreview)
			: Boolean(coverUrl);

	return (
		<>
			{/* Affordance toolbar — sits over the cover band */}
			<div className={styles.toolbar}>
				<button
					type="button"
					className={styles.affordance}
					onClick={() => setMode("cover")}
				>
					<Icon name="nav.photos" size={16} aria-hidden />
					<span>Cover</span>
				</button>
				<button
					type="button"
					className={styles.affordance}
					onClick={() => setMode("logo")}
				>
					<Icon name="nav.photos" size={16} aria-hidden />
					<span>Logo</span>
				</button>
			</div>

			<PopupShell
				open={mode !== null}
				onClose={close}
				title={isCover ? "Choose cover" : "Choose logo"}
				headerIcon={<Icon name="nav.photos" size={24} aria-hidden />}
				size="wide"
				closeLabel={isCover ? "Close cover chooser" : "Close logo chooser"}
				footer={
					<Button variant="primary" className={styles.doneBtn} onClick={close}>
						Done
					</Button>
				}
			>
				{/* Live preview strip */}
				{isCover ? (
					<div className={styles.previewCover}>
						{coverPreviewValue && coverPreviewIsPhoto ? (
							<Image
								src={coverPreviewValue}
								alt=""
								fill
								sizes="(max-width: 640px) 100vw, 560px"
								className={styles.previewCoverImg}
								unoptimized={Boolean(coverUpload)}
							/>
						) : (
							<div
								className={styles.previewCoverFill}
								style={
									coverPreviewValue && !coverPreviewIsPhoto
										? { background: coverPreviewValue }
										: undefined
								}
							/>
						)}
					</div>
				) : (
					<div className={styles.previewLogoRow}>
						<div
							className={styles.previewLogo}
							style={
								logoPreview && !logoUpload
									? { background: logoPreview.gradient }
									: undefined
							}
						>
							{logoUpload ? (
								<Image
									src={logoUpload}
									alt=""
									fill
									sizes="96px"
									className={styles.previewLogoImg}
									unoptimized
								/>
							) : logoPreview ? (
								<span className={styles.previewLogoGlyph} aria-hidden>
									{logoPreview.monogram}
								</span>
							) : logoUrl ? (
								<Image
									src={logoUrl}
									alt=""
									fill
									sizes="96px"
									className={styles.previewLogoImg}
								/>
							) : (
								<span className={styles.previewLogoGlyph} aria-hidden>
									{monogram}
								</span>
							)}
						</div>
					</div>
				)}

				{/* Upload — preferred */}
				<div className={styles.uploadRow}>
					<input
						ref={uploadRef}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className={styles.fileInput}
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) handleUpload(file);
							e.target.value = "";
						}}
					/>
					<button
						type="button"
						className={styles.uploadBtn}
						onClick={() => uploadRef.current?.click()}
					>
						<Icon name="action.more" size={20} aria-hidden />
						Upload your own {isCover ? "cover" : "logo"}
					</button>
					<p className={styles.uploadHint}>Your own photo looks best.</p>
				</div>

				{/* Predefined set */}
				<p className={styles.sectionLabel}>
					{isCover ? "Or pick a cover" : "Or pick a placeholder"}
				</p>
				{isCover ? (
					<div className={styles.grid}>
						{HOST_COVERS.map((opt) => {
							const selected = !coverUpload && coverPreview?.key === opt.key;
							return (
								<button
									key={opt.key}
									type="button"
									className={`${styles.swatch} ${selected ? styles.swatchSelected : ""}`}
									style={opt.kind === "gradient" ? { background: opt.value } : undefined}
									onClick={() => {
										setCoverUpload((prev) => {
											if (prev) URL.revokeObjectURL(prev);
											return null;
										});
										setCoverPreview(opt);
									}}
									aria-label={opt.label}
									aria-pressed={selected}
								>
									{opt.kind === "photo" ? (
										<Image
											src={opt.value}
											alt=""
											fill
											sizes="(max-width: 640px) 33vw, 170px"
											className={styles.swatchImg}
										/>
									) : null}
									<span className={styles.swatchLabel}>{opt.label}</span>
								</button>
							);
						})}
					</div>
				) : (
					<div className={styles.grid}>
						{HOST_LOGOS.map((opt) => {
							const selected = !logoUpload && logoPreview?.key === opt.key;
							return (
								<button
									key={opt.key}
									type="button"
									className={`${styles.logoSwatch} ${selected ? styles.swatchSelected : ""}`}
									style={{ background: opt.gradient }}
									onClick={() => {
										setLogoUpload((prev) => {
											if (prev) URL.revokeObjectURL(prev);
											return null;
										});
										setLogoPreview(opt);
									}}
									aria-label={opt.label}
									aria-pressed={selected}
								>
									<span className={styles.logoSwatchGlyph} aria-hidden>
										{opt.monogram}
									</span>
								</button>
							);
						})}
					</div>
				)}

				<p className={styles.previewNote} role="note">
					<Icon name="system.info" size={16} aria-hidden />
					<span>Preview only — pick or upload to see it here.</span>
				</p>
			</PopupShell>
		</>
	);
}
