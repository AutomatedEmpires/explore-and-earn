"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button, Icon } from "@explore-and-earn/ui";
import {
	effectiveHousingPhotoMap,
	housingPhotoSlots,
	NOT_STATED_LABEL,
	sanitizeHousingPhotoMap,
	SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES,
	UPLOAD_ALLOWED_MIME_TYPES,
	type BenefitProvision,
	type HousingPhotoMap,
	type HousingPhotoRole,
} from "@explore-and-earn/contracts";
import {
	discardBenefitPhotoAction,
	getBenefitDetailsAction,
	getPublicBenefitDetailsAction,
	saveBenefitDetailsAction,
	uploadBenefitPhotoAction,
} from "../../app/actions/benefitDetails";
import { PopupShell } from "../overlay/PopupShell";
import { isLocalStorageUrl } from "../../lib/storageUrl";
import type { DiscoveryListing } from "./listing";
import { isKnownDevDiscoveryFixtureId } from "./fixtureIds";
import {
	BenefitPhotoSessionLedger,
	type TrackedBenefitPhotoUpload,
} from "./benefitPhotoSession";
import styles from "./BenefitTrustModal.module.css";

// ── Types ──────────────────────────────────────────────────────────────────────

export type BenefitKind = "housing" | "meals";

type ChipOption = {
	readonly id: string;
	readonly label: string;
	readonly icon?: "benefit.wifi";
};

type ChipSection = {
	readonly id: string;
	readonly label: string;
	readonly allowAdd: boolean;
	readonly addLabel: string;
	readonly defaults: readonly string[];
	readonly options: readonly ChipOption[];
};

type FieldDef = {
	readonly id: string;
	readonly label: string;
	readonly placeholder: string;
	readonly options: readonly string[];
};

type PhotoSlot = {
	readonly id: string;
	readonly label: string;
};

type PublicReadState = {
	readonly key: string;
	readonly status: "loading" | "ready" | "unavailable";
};

// ── Housing config ─────────────────────────────────────────────────────────────

const HOUSING_FIELDS: readonly FieldDef[] = [
	{
		id: "housing-type",
		label: "Housing type",
		placeholder: "Select housing type",
		options: [
			"Private room",
			"Shared room",
			"Dormitory / bunkhouse",
			"Cabin",
			"Tent / yurt",
			"Van / vehicle",
			"Apartment",
			"Other",
		],
	},
	{
		id: "room-setup",
		label: "Room setup",
		placeholder: "Select room setup",
		options: [
			"Single bed",
			"Twin beds",
			"Bunk beds",
			"Double bed",
			"Open floor plan",
			"Other",
		],
	},
];

const HOUSING_CHIP_SECTIONS: readonly ChipSection[] = [
	{
		id: "amenities",
		label: "Amenities",
		allowAdd: true,
		addLabel: "Add amenity",
		defaults: ["wifi", "laundry", "kitchen", "heat", "shower"],
		options: [
			{ id: "wifi", label: "Wi-Fi", icon: "benefit.wifi" },
			{ id: "laundry", label: "Laundry" },
			{ id: "kitchen", label: "Kitchen" },
			{ id: "heat", label: "Heat" },
			{ id: "shower", label: "Shower" },
			{ id: "electricity", label: "Electricity" },
			{ id: "hot_water", label: "Hot water" },
			{ id: "private_bath", label: "Private bath" },
		],
	},
];

// ── Meals config ───────────────────────────────────────────────────────────────

const MEALS_SLOTS: readonly PhotoSlot[] = [
	{ id: "kitchen", label: "Kitchen" },
	{ id: "prepared", label: "Prepared Meal" },
	{ id: "dining", label: "Dining Area" },
	{ id: "misc", label: "Misc" },
];

const MEALS_FIELDS: readonly FieldDef[] = [
	{
		id: "meal-style",
		label: "Meal style",
		placeholder: "Select meal style",
		options: [
			"Family-style",
			"Buffet",
			"Served plate",
			"Self-service",
			"Cook-your-own",
			"Mixed / varies",
			"Other",
		],
	},
	{
		id: "dietary",
		label: "Dietary accommodations",
		placeholder: "Select accommodations",
		options: [
			"Vegetarian-friendly",
			"Vegan options",
			"Gluten-free options",
			"Halal",
			"Kosher",
			"Nut-free",
			"No specific accommodations",
		],
	},
];

const MEALS_CHIP_SECTIONS: readonly ChipSection[] = [
	{
		id: "meal_times",
		label: "Meals provided",
		allowAdd: false,
		addLabel: "",
		defaults: ["breakfast", "lunch", "dinner"],
		options: [
			{ id: "breakfast", label: "Breakfast" },
			{ id: "lunch", label: "Lunch" },
			{ id: "dinner", label: "Dinner" },
		],
	},
	{
		id: "arrangements",
		label: "Meal arrangements",
		allowAdd: false,
		addLabel: "",
		defaults: [],
		options: [
			{ id: "staff_meals", label: "Staff meals" },
			{ id: "groceries", label: "Groceries provided" },
			{ id: "self_cook", label: "Self-cook" },
		],
	},
];

// ── Kind config ────────────────────────────────────────────────────────────────

type KindConfig = {
	readonly title: string;
	readonly subtitle: string;
	readonly icon: "benefit.housing" | "benefit.meals";
	readonly photoLabel: string;
	readonly saveLabel: string;
	readonly trustNote: string;
	readonly slots: readonly PhotoSlot[];
	readonly fields: readonly FieldDef[];
	readonly chipSections: readonly ChipSection[];
};

const KIND_CONFIG: Record<BenefitKind, KindConfig> = {
	housing: {
		title: "Housing",
		subtitle:
			"Add housing details and photos to help seekers know what to expect and build trust.",
		icon: "benefit.housing",
		photoLabel: "Housing photos",
		saveLabel: "Save housing",
		trustNote: "Profile defaults are inherited here. Add a listing-specific photo only when this opportunity differs.",
		slots: [],
		fields: HOUSING_FIELDS,
		chipSections: HOUSING_CHIP_SECTIONS,
	},
	meals: {
		title: "Meals",
		subtitle:
			"Add meal details and photos to help seekers know what to expect and build trust.",
		icon: "benefit.meals",
		photoLabel: "Meal photos",
		saveLabel: "Save meals",
		trustNote:
			"Transparent meal information helps seekers plan ahead and feel confident.",
		slots: MEALS_SLOTS,
		fields: MEALS_FIELDS,
		chipSections: MEALS_CHIP_SECTIONS,
	},
};

// ── Slot CSS class lookup (avoids dynamic CSS module access) ───────────────────

const HOUSING_SLOT_CLASSES: Record<string, string> = {
	sleeping_area: styles.inside ?? "",
	bathroom: styles.bathroom ?? "",
	kitchen: styles.kitchen ?? "",
	dining_common: styles.housingMisc ?? "",
};

const MEALS_SLOT_CLASSES: Record<string, string> = {
	kitchen: styles.kitchen ?? "",
	prepared: styles.prepared ?? "",
	dining: styles.dining ?? "",
	misc: styles.mealsMisc ?? "",
};

const HOUSING_PHOTO_LIBRARY_UNAVAILABLE =
	"Housing photos are not available yet. Reload and try again.";

function slotClass(kind: BenefitKind, slotId: string): string {
	const map = kind === "housing" ? HOUSING_SLOT_CLASSES : MEALS_SLOT_CLASSES;
	return map[slotId] ?? "";
}

// ── Provision display ──────────────────────────────────────────────────────────

const PROVISION_LABEL: Record<BenefitProvision, string> = {
	provided: "Provided",
	partial: "Partial",
	not_provided: "Not provided",
	not_stated: NOT_STATED_LABEL,
};

const PROVISION_CLASS: Record<BenefitProvision, string> = {
	provided: styles.provided ?? "",
	partial: styles.partial ?? "",
	not_provided: styles.not_provided ?? "",
	// No styling of its own: an unanswered benefit must not be dressed up as a
	// negative answer (which is what reusing .not_provided here would do).
	not_stated: "",
};

// ── State init ─────────────────────────────────────────────────────────────────

function initToggles(sections: readonly ChipSection[]): Record<string, Set<string>> {
	const result: Record<string, Set<string>> = {};
	for (const s of sections) {
		result[s.id] = new Set(s.defaults);
	}
	return result;
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface BenefitTrustModalEditProps {
	readonly mode: "edit";
	readonly open: boolean;
	readonly kind: BenefitKind;
	readonly onClose: () => void;
	readonly listingId?: string;
	readonly category?: string;
}

export interface BenefitTrustModalViewProps {
	readonly mode?: "view";
	readonly listing: DiscoveryListing | null;
	readonly bucket: BenefitKind | null;
	/** Server-attested fixture evidence used by remote preview surfaces. */
	readonly publicReadEvidence?: "known_empty";
	readonly onClose: () => void;
}

export type BenefitTrustModalProps =
	| BenefitTrustModalEditProps
	| BenefitTrustModalViewProps;

// ── Component ──────────────────────────────────────────────────────────────────

export function BenefitTrustModal(props: BenefitTrustModalProps) {
	const isEdit = props.mode === "edit";

	const kind: BenefitKind | null = isEdit
		? (props as BenefitTrustModalEditProps).kind
		: (props as BenefitTrustModalViewProps).bucket;

	const open: boolean = isEdit
		? (props as BenefitTrustModalEditProps).open
		: Boolean(
				(props as BenefitTrustModalViewProps).listing &&
					(props as BenefitTrustModalViewProps).bucket,
			);

	const cfg = kind ? KIND_CONFIG[kind] : null;
	const listingId = isEdit
		? (props as BenefitTrustModalEditProps).listingId
		: (props as BenefitTrustModalViewProps).listing?.id;
	const category = isEdit
		? (props as BenefitTrustModalEditProps).category
		: (props as BenefitTrustModalViewProps).listing?.category;
	const knownEmptyFixtureEvidence =
		!isEdit &&
		((props as BenefitTrustModalViewProps).publicReadEvidence === "known_empty" ||
			isKnownDevDiscoveryFixtureId(listingId));

	const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
	const [toggles, setToggles] = useState<Record<string, Set<string>>>(() =>
		cfg ? initToggles(cfg.chipSections) : {},
	);
	const [photos, setPhotos] = useState<Record<string, string>>({});
	const [profileHousingPhotos, setProfileHousingPhotos] = useState<HousingPhotoMap>({});
	const [housingPhotoLibraryAvailable, setHousingPhotoLibraryAvailable] = useState<
		boolean | null
	>(null);
	const [customChips, setCustomChips] = useState<
		Record<string, { id: string; label: string }[]>
	>({});
	const [hydrating, setHydrating] = useState(false);
	const [publicRead, setPublicRead] = useState<PublicReadState | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [uploadingSlots, setUploadingSlots] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [cleaningUploads, setCleaningUploads] = useState(false);
	const sessionUploads = useRef(new BenefitPhotoSessionLedger());
	const [addingTo, setAddingTo] = useState<string | null>(null);
	const [draftChip, setDraftChip] = useState("");
	const editorLocked =
		hydrating || saving || cleaningUploads || uploadingSlots.size > 0;
	// Hydration is cancellable (the effect cleanup ignores late results), so the
	// dialog can still close while saved details are loading. Only operations
	// that mutate or clean up storage must hold the user in the dialog.
	const closeLocked = saving || cleaningUploads || uploadingSlots.size > 0;

	// Hydrate from saved detail whenever the modal opens (or the kind switches
	// while open). EDIT pulls the host-scoped detail; VIEW pulls the public
	// detail so seekers see the photos + facts the host published. Resets first
	// so a stale kind can't bleed across — edit pre-checks defaults, view starts
	// empty (only render what was actually saved).
	useEffect(() => {
		if (!open || !kind) {
			if (!isEdit) setPublicRead(null);
			return;
		}
		const sections = KIND_CONFIG[kind].chipSections;
		setError(null);
		setAddingTo(null);
		setDraftChip("");
		setFieldValues({});
		setToggles(() => {
			const next: Record<string, Set<string>> = {};
			for (const s of sections) next[s.id] = new Set(isEdit ? s.defaults : []);
			return next;
		});
		setPhotos({});
		setProfileHousingPhotos({});
		setHousingPhotoLibraryAvailable(null);
		setCustomChips({});
		if (!listingId) {
			setHydrating(false);
			return;
		}

		let cancelled = false;
		const readKey = `${listingId}:${kind}`;
		if (knownEmptyFixtureEvidence) {
			// Discovery fixtures define no benefit-detail photos. That is known empty
			// evidence, not a failed database read, so render the honest 0/4 state and
			// do not send a non-UUID fixture id to the production RPC boundary.
			setHydrating(false);
			setPublicRead({ key: readKey, status: "ready" });
			return;
		}
		setHydrating(true);
		if (!isEdit) setPublicRead({ key: readKey, status: "loading" });
		const load = isEdit
			? getBenefitDetailsAction(listingId).then((res) => {
					if (!res.ok) throw new Error(res.error ?? "load_failed");
					return {
						detail: res.details?.[kind],
						benefitLibrary: res.benefitLibrary,
						housingPhotoLibraryAvailable:
							res.housingPhotoLibraryAvailable === true,
					};
				})
				: getPublicBenefitDetailsAction(listingId).then((res) => {
						if (!res.ok) throw new Error(res.error);
						return {
							detail: res.details[kind],
							benefitLibrary: undefined,
							housingPhotoLibraryAvailable: false,
						};
					});
		load
			.then(({ detail, benefitLibrary, housingPhotoLibraryAvailable: available }) => {
				if (cancelled) return;
				setHousingPhotoLibraryAvailable(available);
				setProfileHousingPhotos(
					sanitizeHousingPhotoMap(benefitLibrary?.housing?.photos),
				);
					if (detail) {
						setFieldValues({ ...detail.fields });
						setPhotos({ ...detail.photos });
						setCustomChips(
							Object.fromEntries(
								Object.entries(detail.customChips ?? {}).map(([k, v]) => [
									k,
									v.map((c) => ({ ...c })),
								]),
							),
						);
						setToggles(() => {
							const next: Record<string, Set<string>> = {};
							for (const s of sections) {
								next[s.id] = new Set(
									detail.toggles?.[s.id] ?? (isEdit ? s.defaults : []),
								);
							}
							return next;
						});
					}
					if (!isEdit) setPublicRead({ key: readKey, status: "ready" });
				})
				.catch(() => {
					if (cancelled) return;
					if (isEdit) setError("Could not load saved details.");
					else setPublicRead({ key: readKey, status: "unavailable" });
				})
			.finally(() => {
				if (!cancelled) setHydrating(false);
			});
		return () => {
			cancelled = true;
		};
		// cfg/sections are derived from kind (a dep); listingId/open/isEdit complete it.
	}, [isEdit, open, kind, listingId, knownEmptyFixtureEvidence]);

	if (!kind || !cfg) return null;

	const viewListing = !isEdit
		? (props as BenefitTrustModalViewProps).listing
		: null;
	const benefitInfo = viewListing ? viewListing.benefits[kind] : null;
	const canUpload = Boolean(listingId);
	const publicReadStatus =
		isEdit || !open || !kind
			? "idle"
			: knownEmptyFixtureEvidence
				? "ready"
			: !listingId
				? "unavailable"
				: publicRead?.key === `${listingId}:${kind}`
					? publicRead.status
					: "loading";
	const configuredSlots =
		kind === "housing"
			? isEdit &&
				Boolean(listingId) &&
				housingPhotoLibraryAvailable === false
				? []
				: housingPhotoSlots(category)
			: cfg.slots;
	const displayPhotos: Record<string, string | undefined> =
		kind === "housing" && isEdit
			? { ...effectiveHousingPhotoMap(
					{ housing: { photos: profileHousingPhotos } },
					sanitizeHousingPhotoMap(photos),
				) }
			: photos;
	// Both modes show the complete four-category evidence contract. In seeker
	// view, an empty slot is useful truth: the host has not supplied that photo.
	// Filtering those slots out made an incomplete bucket look complete.
	const slotsToShow = configuredSlots;
	const filledPhotoCount = configuredSlots.filter(
		(slot) => Boolean(displayPhotos[slot.id]),
	).length;
	const housingPhotoLibraryUnavailable =
		kind === "housing" &&
		isEdit &&
		Boolean(listingId) &&
		!hydrating &&
		housingPhotoLibraryAvailable === false;
	// Saved single-select facts (housing type, meal style…) for the read-only view.
	const viewFacts = isEdit
		? []
		: cfg.fields
				.map((f) => ({ label: f.label, value: fieldValues[f.id] }))
				.filter((f): f is { label: string; value: string } => Boolean(f.value));

	function toggleOption(sectionId: string, optId: string) {
		if (editorLocked) return;
		setToggles((prev) => {
			const cur = new Set(prev[sectionId] ?? []);
			if (cur.has(optId)) cur.delete(optId);
			else cur.add(optId);
			return { ...prev, [sectionId]: cur };
		});
	}

	async function discardSessionUploads(
		uploads: readonly TrackedBenefitPhotoUpload[],
	): Promise<boolean> {
		if (uploads.length === 0) return true;
		setCleaningUploads(true);
		let failure: string | null = null;
		try {
			await Promise.all(
				uploads.map(async (upload) => {
					try {
						const result = await discardBenefitPhotoAction(
							upload.listingId,
							upload.kind,
							upload.slot,
							upload.url,
						);
						if (result.ok) {
							sessionUploads.current.forget(upload.url);
						} else {
							failure ??= result.error ?? "Could not discard an unused photo.";
						}
					} catch {
						failure ??= "Could not discard an unused photo. Check your connection and try again.";
					}
				}),
			);
		} finally {
			setCleaningUploads(false);
		}
		if (failure) {
			setError(failure);
			return false;
		}
		return true;
	}

	async function handleSlotFile(slotId: string, file: File) {
		if (!listingId || !kind || editorLocked) return;
		setError(null);
		if (file.size > SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES) {
			setError("Images must be 4 MB or smaller.");
			return;
		}
		setUploadingSlots((current) => new Set(current).add(slotId));
		try {
			const fd = new FormData();
			fd.append("file", file);
			const res = await uploadBenefitPhotoAction(listingId, kind, slotId, fd);
			if (res.ok && res.url) {
				const url = res.url;
				const replaced = sessionUploads.current.track({
					listingId,
					kind,
					slot: slotId,
					url,
				});
				setPhotos((prev) => ({ ...prev, [slotId]: url }));
				if (replaced) await discardSessionUploads([replaced]);
			} else {
				setError(res.error ?? "Upload failed. Please try again.");
			}
		} catch {
			setError("Upload failed. Check your connection and try again.");
		} finally {
			setUploadingSlots((current) => {
				const next = new Set(current);
				next.delete(slotId);
				return next;
			});
		}
	}

	async function removePhoto(slotId: string) {
		if (editorLocked || !kind) return;
		const tracked = listingId
			? sessionUploads.current.removeCurrent(listingId, kind, slotId)
			: undefined;
		setPhotos((prev) => {
			const next = { ...prev };
			delete next[slotId];
			return next;
		});
		if (tracked) await discardSessionUploads([tracked]);
	}

	async function handleClose() {
		if (!isEdit) {
			props.onClose();
			return;
		}
		if (closeLocked) return;
		setError(null);
		if (await discardSessionUploads(sessionUploads.current.all())) {
			props.onClose();
		}
	}

	function addCustomChip(sectionId: string) {
		if (editorLocked) return;
		const label = draftChip.trim();
		if (!label) {
			setAddingTo(null);
			return;
		}
		const slug =
			label
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "") || "item";
		const id = `custom-${slug}`;
		setCustomChips((prev) => {
			const list = prev[sectionId] ?? [];
			if (list.some((c) => c.id === id)) return prev;
			return { ...prev, [sectionId]: [...list, { id, label }] };
		});
		setToggles((prev) => ({
			...prev,
			[sectionId]: new Set([...(prev[sectionId] ?? []), id]),
		}));
		setDraftChip("");
		setAddingTo(null);
	}

	async function handleSave() {
		if (!kind || !listingId) {
			setError("Save the listing first, then add benefit details.");
			return;
		}
		if (editorLocked) {
			setError("Wait for every photo to finish uploading.");
			return;
		}
		if (!(await discardSessionUploads(sessionUploads.current.stale()))) return;
		setSaving(true);
		setError(null);
		try {
			const detail = {
				fields: fieldValues,
				toggles: Object.fromEntries(
					Object.entries(toggles).map(([k, v]) => [k, Array.from(v)]),
				),
				photos,
				customChips,
			};
			const res = await saveBenefitDetailsAction(listingId, kind, detail);
			if (res.ok) {
				sessionUploads.current.clear();
				props.onClose();
			}
			else setError(res.error ?? "Could not save. Please try again.");
		} catch {
			setError("Could not save. Check your connection and try again.");
		} finally {
			setSaving(false);
		}
	}

	const footer = isEdit ? (
		<div className={styles.footerRow}>
			<Button
				variant="secondary"
				onClick={handleClose}
				disabled={closeLocked}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				className={styles.saveBtn}
				onClick={handleSave}
				disabled={editorLocked}
			>
				{saving
					? "Saving…"
					: uploadingSlots.size > 0
						? "Uploading photos…"
						: cfg.saveLabel}
			</Button>
		</div>
	) : (
		<Button variant="primary" className={styles.saveBtn} onClick={props.onClose}>
			Got it
		</Button>
	);

	return (
		<PopupShell
			open={open}
			onClose={isEdit ? handleClose : props.onClose}
			closeDisabled={closeLocked}
			title={cfg.title}
			headerIcon={<Icon name={cfg.icon} size={24} aria-hidden />}
			footer={footer}
			size="wide"
			closeLabel={`Close ${cfg.title.toLowerCase()} details`}
		>
			<p className={styles.subtitle}>
				{isEdit
					? cfg.subtitle
					: `${cfg.title} details, including photo evidence when the host has provided it.`}
			</p>

			{/* ── Photo grid: all four defined evidence categories in both modes ── */}
			{isEdit || slotsToShow.length > 0 ? (
			<section className={styles.photoSection} aria-label={cfg.photoLabel}>
				{housingPhotoLibraryUnavailable ? (
					<p className={styles.photoUnavailable} role="status">
						{HOUSING_PHOTO_LIBRARY_UNAVAILABLE}
					</p>
				) : (
				<>
				{publicReadStatus === "loading" ? (
					<p className={styles.photoStatus} role="status" aria-live="polite">
						Loading host photo evidence…
					</p>
				) : publicReadStatus === "unavailable" ? (
					<p className={styles.photoStatus} role="status" aria-live="polite">
						Host photo evidence is unavailable right now. Close and try again.
					</p>
				) : null}
				<div className={styles.photoGrid}>
					{slotsToShow.map((slot) => {
						const photoUrl = displayPhotos[slot.id];
						const listingOverride = Boolean(photos[slot.id]);
						const inherited = kind === "housing" && isEdit && photoUrl && !listingOverride;
						return (
							<div
								key={slot.id}
								className={`${styles.photoSlot} ${slotClass(kind, slot.id)}`}
							>
								<div className={styles.photoArea}>
										{photoUrl ? (
											<Image
											src={photoUrl}
											alt={`${slot.label} photo`}
											fill
											sizes="(max-width: 639px) 45vw, 240px"
											className={styles.photoImg}
												unoptimized={isLocalStorageUrl(photoUrl)}
											/>
										) : !isEdit ? (
											<span
												className={styles.photoEmpty}
												role="img"
												aria-label={`${slot.label}: ${
													publicReadStatus === "ready"
														? "no photo added"
														: publicReadStatus === "loading"
															? "checking photo availability"
															: "photo availability unknown"
												}`}
											>
												<Icon name={cfg.icon} size={20} aria-hidden />
												<span>
													{publicReadStatus === "ready"
														? "No photo"
														: publicReadStatus === "loading"
															? "Checking…"
															: "Availability unknown"}
												</span>
											</span>
										) : null}
								{isEdit && uploadingSlots.has(slot.id) ? (
										<span
											className={styles.cameraButton}
											role="status"
											aria-label={`Uploading ${slot.label} photo`}
										>
											<span className={styles.spinner} aria-hidden />
										</span>
									) : isEdit && listingOverride ? (
										<button
											type="button"
											className={styles.removePhoto}
											onClick={() => removePhoto(slot.id)}
										disabled={editorLocked}
											aria-label={
								profileHousingPhotos[slot.id as HousingPhotoRole]
													? `Use profile default for ${slot.label}`
													: `Remove ${slot.label} photo`
											}
										>
											<Icon name="action.close" size={16} aria-hidden />
										</button>
									) : isEdit ? (
										<>
											<input
												id={`bp-${kind}-${slot.id}`}
												type="file"
											accept={UPLOAD_ALLOWED_MIME_TYPES.join(",")}
											className={styles.fileInput}
											disabled={!canUpload || editorLocked}
											aria-label={
												canUpload
													? `${inherited ? "Override" : "Upload"} ${slot.label} photo`
													: "Save the listing before adding photos"
											}
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) void handleSlotFile(slot.id, file);
													e.target.value = "";
												}}
											/>
											<label
												htmlFor={`bp-${kind}-${slot.id}`}
												className={styles.cameraButton}
												aria-label={
													canUpload
														? `${inherited ? "Override" : "Upload"} ${slot.label} photo`
														: "Save the listing before adding photos"
												}
											aria-disabled={!canUpload || editorLocked}
											>
												<Icon name="nav.photos" size={16} aria-hidden />
											</label>
										</>
									) : null}
									{kind === "housing" && isEdit && photoUrl ? (
										<span className={styles.photoSource}>
											{inherited ? "Profile default" : "Listing-specific"}
										</span>
									) : null}
								</div>
								<span className={styles.slotLabel}>{slot.label.toUpperCase()}</span>
							</div>
						);
					})}
					</div>
					{!isEdit && publicReadStatus === "ready" ? (
						<p className={styles.photoStatus} role="status">
							{filledPhotoCount} of {configuredSlots.length} photo categories added
						</p>
					) : null}
					</>
					)}
			</section>
			) : null}

			{isEdit ? (
				<>
					{/* ── Fields ──────────────────────────────────────── */}
					<div className={styles.fieldRow}>
						{cfg.fields.map((f) => (
							<div key={f.id} className={styles.field}>
								<label className={styles.fieldLabel} htmlFor={f.id}>
									{f.label}
								</label>
								<select
									id={f.id}
									className={styles.select}
									value={fieldValues[f.id] ?? ""}
									disabled={editorLocked}
									onChange={(e) =>
										setFieldValues((prev) => ({
											...prev,
											[f.id]: e.target.value,
										}))
									}
								>
									<option value="">{f.placeholder}</option>
									{f.options.map((o) => (
										<option key={o} value={o}>
											{o}
										</option>
									))}
								</select>
							</div>
						))}
					</div>

					{/* ── Chip sections ───────────────────────────────── */}
					{cfg.chipSections.map((section) => {
						const allOptions = [
							...section.options,
							...(customChips[section.id] ?? []),
						];
						return (
						<section
							key={section.id}
							className={styles.chipSection}
							aria-label={section.label}
						>
							<span className={styles.chipLabel}>{section.label}</span>
							<div className={styles.chips}>
								{allOptions.map((opt) => {
									const selected = toggles[section.id]?.has(opt.id) ?? false;
									const optIcon = "icon" in opt ? opt.icon : undefined;
									return (
										<button
											key={opt.id}
											type="button"
											className={
												selected
													? `${styles.chip} ${styles.chipActive}`
													: styles.chip
											}
										onClick={() => toggleOption(section.id, opt.id)}
										aria-pressed={selected}
										disabled={editorLocked}
										>
											{optIcon ? (
												<Icon name={optIcon} size={16} aria-hidden />
											) : null}
											{opt.label.toUpperCase()}
										</button>
									);
								})}
								{section.allowAdd ? (
									addingTo === section.id ? (
										<span className={styles.addChipForm}>
											<input
												className={styles.addChipInput}
												value={draftChip}
												autoFocus
												maxLength={24}
												placeholder={section.addLabel}
											aria-label={section.addLabel}
											disabled={editorLocked}
												onChange={(e) => setDraftChip(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														addCustomChip(section.id);
													} else if (e.key === "Escape") {
														setDraftChip("");
														setAddingTo(null);
													}
												}}
											/>
											<button
												type="button"
												className={styles.addChipConfirm}
											onClick={() => addCustomChip(section.id)}
											disabled={editorLocked}
											>
												Add
											</button>
										</span>
									) : (
										<button
											type="button"
											className={`${styles.chip} ${styles.chipAdd}`}
											onClick={() => {
												setDraftChip("");
												setAddingTo(section.id);
											}}
											disabled={editorLocked}
										>
											+ {section.addLabel.toUpperCase()}
										</button>
									)
								) : null}
							</div>
						</section>
					);
					})}
				</>
			) : benefitInfo ? (
				/* ── View mode (seeker): provision + summary + published detail ── */
				<div className={styles.viewSummary}>
					<div className={styles.viewSummaryHead}>
						<span className={styles.summaryLabel}>
							What&apos;s provided
						</span>
						<span
							className={`${styles.provisionBadge} ${PROVISION_CLASS[benefitInfo.provision]}`}
						>
							{PROVISION_LABEL[benefitInfo.provision]}
						</span>
					</div>
					<p
						className={
							benefitInfo.summary ? styles.descriptor : styles.descriptorMuted
						}
					>
						{benefitInfo.summary ?? "The host hasn't added a description yet."}
					</p>

					{viewFacts.length > 0 ? (
						<dl className={styles.viewFacts}>
							{viewFacts.map((fact) => (
								<div key={fact.label} className={styles.viewFact}>
									<dt className={styles.viewFactLabel}>{fact.label}</dt>
									<dd className={styles.viewFactValue}>{fact.value}</dd>
								</div>
							))}
						</dl>
					) : null}

					{cfg.chipSections.map((section) => {
						const all = [
							...section.options,
							...(customChips[section.id] ?? []),
						];
						const selected = all.filter(
							(opt) => toggles[section.id]?.has(opt.id),
						);
						if (selected.length === 0) return null;
						return (
							<div key={section.id} className={styles.viewChipGroup}>
								<span className={styles.chipLabel}>{section.label}</span>
								<div className={styles.chips}>
									{selected.map((opt) => {
										const optIcon = "icon" in opt ? opt.icon : undefined;
										return (
											<span
												key={opt.id}
												className={`${styles.chip} ${styles.chipReadonly}`}
											>
												{optIcon ? (
													<Icon name={optIcon} size={16} aria-hidden />
												) : null}
												{opt.label.toUpperCase()}
											</span>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			) : null}

			{isEdit && error ? (
				<p className={styles.formError} role="alert">
					{error}
				</p>
			) : null}

			{/* ── Trust note ──────────────────────────────────────────────
			   Edit (host): encouraging call to add detail, above the shared
			   verify caption. Both modes end on the same quiet, secondary
			   "confirm the arrangements" note at the very bottom. */}
			{isEdit ? (
				<div className={styles.trustNote} data-kind={kind} role="note">
					<span className={styles.trustIcon} aria-hidden>
						<Icon name="trust.verified_host" size={20} />
					</span>
					<p className={styles.trustText}>{cfg.trustNote}</p>
				</div>
			) : null}
			<p className={styles.verifyNote} role="note">
				<Icon name="system.info" size={16} aria-hidden />
				<span>Always confirm the exact arrangements with the host.</span>
			</p>
		</PopupShell>
	);
}
