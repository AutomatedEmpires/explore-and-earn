"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button, Icon } from "@explore-and-earn/ui";
import {
	UPLOAD_ALLOWED_MIME_TYPES,
	type BenefitProvision,
} from "@explore-and-earn/contracts";
import {
	getBenefitDetailsAction,
	getPublicBenefitDetailsAction,
	saveBenefitDetailsAction,
	uploadBenefitPhotoAction,
} from "../../app/actions/benefitDetails";
import { PopupShell } from "../overlay/PopupShell";
import {
	benefitDismissBlocker,
	publicBenefitPhotoStatus,
} from "./benefitTrustState";
import type { DiscoveryListing } from "./listing";
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

// ── Housing config ─────────────────────────────────────────────────────────────

const HOUSING_SLOTS: readonly PhotoSlot[] = [
	// Storage ids stay backward-compatible; labels describe the four views
	// seekers were promised in the product model.
	{ id: "outside", label: "Exterior" },
	{ id: "inside", label: "Interior" },
	{ id: "bathroom", label: "Bathroom" },
	{ id: "misc", label: "Other view" },
];

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
	{ id: "prepared", label: "Typical meal" },
	{ id: "dining", label: "Dining area" },
	{ id: "misc", label: "Other view" },
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
	readonly editSubtitle: string;
	readonly viewSubtitle: string;
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
		editSubtitle:
			"Add housing details and photos to help seekers know what to expect and build trust.",
		viewSubtitle:
			"See exactly what the host has confirmed about where you will stay.",
		icon: "benefit.housing",
		photoLabel: "Housing photos",
		saveLabel: "Save housing",
		trustNote: "Detailed housing info helps seekers feel confident.",
		slots: HOUSING_SLOTS,
		fields: HOUSING_FIELDS,
		chipSections: HOUSING_CHIP_SECTIONS,
	},
	meals: {
		title: "Meals",
		editSubtitle:
			"Add meal details and photos to help seekers know what to expect and build trust.",
		viewSubtitle:
			"See exactly what the host has confirmed about meals and shared food spaces.",
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
	outside: styles.outside ?? "",
	inside: styles.inside ?? "",
	bathroom: styles.bathroom ?? "",
	misc: styles.housingMisc ?? "",
};

const MEALS_SLOT_CLASSES: Record<string, string> = {
	kitchen: styles.kitchen ?? "",
	prepared: styles.prepared ?? "",
	dining: styles.dining ?? "",
	misc: styles.mealsMisc ?? "",
};

function slotClass(kind: BenefitKind, slotId: string): string {
	const map = kind === "housing" ? HOUSING_SLOT_CLASSES : MEALS_SLOT_CLASSES;
	return map[slotId] ?? "";
}

// ── Provision display ──────────────────────────────────────────────────────────

const PROVISION_LABEL: Record<BenefitProvision, string> = {
	provided: "Provided",
	partial: "Partial",
	not_provided: "Not provided",
};

const PROVISION_CLASS: Record<BenefitProvision, string> = {
	provided: styles.provided ?? "",
	partial: styles.partial ?? "",
	not_provided: styles.not_provided ?? "",
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
}

export interface BenefitTrustModalViewProps {
	readonly mode?: "view";
	readonly listing: Pick<DiscoveryListing, "id" | "benefits"> | null;
	readonly bucket: BenefitKind | null;
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

	const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
	const [toggles, setToggles] = useState<Record<string, Set<string>>>(() =>
		cfg ? initToggles(cfg.chipSections) : {},
	);
	const [photos, setPhotos] = useState<Record<string, string>>({});
	const [customChips, setCustomChips] = useState<
		Record<string, { id: string; label: string }[]>
	>({});
	const [hydrating, setHydrating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
	const [addingTo, setAddingTo] = useState<string | null>(null);
	const [draftChip, setDraftChip] = useState("");
	const [dirty, setDirty] = useState(false);
	const [publicLoadUnavailable, setPublicLoadUnavailable] = useState(false);

	// Hydrate from saved detail whenever the modal opens (or the kind switches
	// while open). EDIT pulls the host-scoped detail; VIEW pulls the public
	// detail so seekers see the photos + facts the host published. Resets first
	// so a stale kind can't bleed across — edit pre-checks defaults, view starts
	// empty (only render what was actually saved).
	useEffect(() => {
		if (!open || !kind) return;
		const sections = KIND_CONFIG[kind].chipSections;
		setError(null);
		setDirty(false);
		setPublicLoadUnavailable(false);
		setAddingTo(null);
		setDraftChip("");
		setFieldValues({});
		setToggles(() => {
			const next: Record<string, Set<string>> = {};
			for (const s of sections) next[s.id] = new Set(isEdit ? s.defaults : []);
			return next;
		});
		setPhotos({});
		setCustomChips({});
		if (!listingId) return;

		let cancelled = false;
		setHydrating(true);
		const load = isEdit
			? getBenefitDetailsAction(listingId).then((res) => {
					if (!res.ok) throw new Error(res.error ?? "load_failed");
					return res.details?.[kind];
				})
			: getPublicBenefitDetailsAction(listingId).then((res) => {
					if (!res.ok) throw new Error(res.error);
					return res.details?.[kind];
				});
		load
			.then((detail) => {
				if (cancelled) return;
				setPublicLoadUnavailable(false);
				setDirty(false);
				if (!detail) return;
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
						next[s.id] = new Set(detail.toggles?.[s.id] ?? (isEdit ? s.defaults : []));
					}
					return next;
				});
			})
			.catch(() => {
				if (cancelled) return;
				if (isEdit) {
					setError("Could not load saved details.");
				} else {
					setPublicLoadUnavailable(true);
					setError("Benefit details are temporarily unavailable.");
				}
			})
			.finally(() => {
				if (!cancelled) setHydrating(false);
			});
		return () => {
			cancelled = true;
		};
		// cfg/sections are derived from kind (a dep); listingId/open/isEdit complete it.
	}, [isEdit, open, kind, listingId]);

	if (!kind || !cfg) return null;

	const viewListing = !isEdit
		? (props as BenefitTrustModalViewProps).listing
		: null;
	const benefitInfo = viewListing ? viewListing.benefits[kind] : null;
	const canUpload = Boolean(listingId);
	// Always show the canonical four-slot story. In public view, unfilled slots
	// render an explicit empty state instead of disappearing or implying imagery.
	const slotsToShow = cfg.slots;
	// Saved single-select facts (housing type, meal style…) for the read-only view.
	const viewFacts = isEdit
		? []
		: cfg.fields
				.map((f) => ({ label: f.label, value: fieldValues[f.id] }))
				.filter((f): f is { label: string; value: string } => Boolean(f.value));

	function toggleOption(sectionId: string, optId: string) {
		setDirty(true);
		setToggles((prev) => {
			const cur = new Set(prev[sectionId] ?? []);
			if (cur.has(optId)) cur.delete(optId);
			else cur.add(optId);
			return { ...prev, [sectionId]: cur };
		});
	}

	async function handleSlotFile(slotId: string, file: File) {
		if (!listingId || !kind) return;
		setError(null);
		setUploadingSlot(slotId);
		try {
			const fd = new FormData();
			fd.append("file", file);
			const res = await uploadBenefitPhotoAction(listingId, kind, slotId, fd);
			if (res.ok && res.url) {
				const url = res.url;
				setPhotos((prev) => ({ ...prev, [slotId]: url }));
				setDirty(true);
			} else {
				setError(res.error ?? "Upload failed. Please try again.");
			}
		} finally {
			setUploadingSlot(null);
		}
	}

	function removePhoto(slotId: string) {
		setDirty(true);
		setPhotos((prev) => {
			const next = { ...prev };
			delete next[slotId];
			return next;
		});
	}

	function addCustomChip(sectionId: string) {
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
		setDirty(true);
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

	function canClose(): boolean {
		if (isEdit && saving) {
			setError("Wait for benefit details to finish saving before closing.");
			return false;
		}
		const blocker = benefitDismissBlocker(
			isEdit ? "edit" : "view",
			dirty,
			uploadingSlot !== null,
		);
		if (blocker === "uploading") {
			setError("Wait for the photo upload to finish before closing.");
			return false;
		}
		if (
			blocker === "dirty" &&
			!window.confirm(
				"Discard unsaved benefit changes? Newly uploaded photos will not be published until you save.",
			)
		) {
			return false;
		}
		setDirty(false);
		return true;
	}

	function requestClose() {
		if (!canClose()) return;
		props.onClose();
	}

	async function handleSave() {
		if (!kind || !listingId) {
			setError("Save the listing first, then add benefit details.");
			return;
		}
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
				setDirty(false);
				props.onClose();
			} else {
				setError(res.error ?? "Could not save. Please try again.");
			}
		} finally {
			setSaving(false);
		}
	}

	const footer = isEdit ? (
		<div className={styles.footerRow}>
			<Button
				variant="secondary"
				onClick={requestClose}
				disabled={saving || uploadingSlot !== null}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				className={styles.saveBtn}
				onClick={handleSave}
				disabled={saving || hydrating || uploadingSlot !== null}
			>
				{saving ? "Saving…" : cfg.saveLabel}
			</Button>
		</div>
	) : (
		<Button variant="primary" className={styles.saveBtn} onClick={requestClose}>
			Got it
		</Button>
	);

	return (
		<PopupShell
			open={open}
			onBeforeClose={canClose}
			onClose={props.onClose}
			title={cfg.title}
			headerIcon={<Icon name={cfg.icon} size={24} aria-hidden />}
			footer={footer}
			size="wide"
			closeLabel={`Close ${cfg.title.toLowerCase()} details`}
		>
			<p className={styles.subtitle}>
				{isEdit ? cfg.editSubtitle : cfg.viewSubtitle}
			</p>

			{/* ── Canonical four-slot photo story ─────────────────────── */}
			<section
				className={styles.photoSection}
				aria-label={cfg.photoLabel}
				aria-busy={hydrating}
			>
				<div className={styles.photoGrid}>
					{slotsToShow.map((slot) => (
						<div
							key={slot.id}
							className={`${styles.photoSlot} ${slotClass(kind, slot.id)}`}
						>
							<div
								className={
									!isEdit && !photos[slot.id]
										? `${styles.photoArea} ${styles.photoAreaEmpty}`
										: styles.photoArea
								}
							>
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
										{isEdit ? (
											<button
												type="button"
												className={styles.removePhoto}
												onClick={() => removePhoto(slot.id)}
												aria-label={`Remove ${slot.label} photo`}
											>
												<Icon name="action.close" size={16} aria-hidden />
											</button>
										) : null}
									</>
								) : isEdit ? (
									uploadingSlot === slot.id ? (
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
												id={`bp-${kind}-${slot.id}`}
												type="file"
												accept={UPLOAD_ALLOWED_MIME_TYPES.join(",")}
												className={styles.fileInput}
												disabled={!canUpload}
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
														? `Upload ${slot.label} photo`
														: "Save the listing before adding photos"
												}
												aria-disabled={!canUpload}
											>
												<Icon name="nav.photos" size={16} aria-hidden />
											</label>
										</>
									)
								) : (
									<span className={styles.emptyPhotoState}>
										<Icon name="nav.photos" size={20} aria-hidden />
										<span>
											{publicBenefitPhotoStatus(
												hydrating,
												publicLoadUnavailable,
											)}
										</span>
									</span>
								)}
							</div>
							<span className={styles.slotLabel}>
								{slot.label.toUpperCase()}
							</span>
						</div>
					))}
				</div>
			</section>

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
									onChange={(e) => {
										setDirty(true);
										setFieldValues((prev) => ({
											...prev,
											[f.id]: e.target.value,
										}));
									}}
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
											onChange={(e) => {
												setDraftChip(e.target.value);
												setDirty(true);
											}}
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
					<span
						className={`${styles.provisionBadge} ${PROVISION_CLASS[benefitInfo.provision]}`}
					>
						{PROVISION_LABEL[benefitInfo.provision]}
					</span>
					{benefitInfo.summary ? (
						<p className={styles.summaryText}>{benefitInfo.summary}</p>
					) : null}

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

			{error ? (
				<p className={styles.formError} role="alert">
					{error}
				</p>
			) : null}

			{/* ── Trust note ──────────────────────────────────────────── */}
			<div className={styles.trustNote} data-kind={kind} role="note">
				<span className={styles.trustIcon} aria-hidden>
					<Icon name="trust.verified_host" size={20} />
				</span>
				<p className={styles.trustText}>{cfg.trustNote}</p>
			</div>
		</PopupShell>
	);
}
