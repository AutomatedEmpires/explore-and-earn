"use client";

import { useState } from "react";
import { Button, Icon } from "@explore-and-earn/ui";
import type { BenefitProvision } from "@explore-and-earn/contracts";
import { PopupShell } from "../overlay/PopupShell";
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
	{ id: "outside", label: "Outside" },
	{ id: "inside", label: "Inside" },
	{ id: "bathroom", label: "Bathroom" },
	{ id: "misc", label: "Misc" },
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
		trustNote: "Detailed housing info helps seekers feel confident.",
		slots: HOUSING_SLOTS,
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
	readonly listing: DiscoveryListing | null;
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

	const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
	const [toggles, setToggles] = useState<Record<string, Set<string>>>(() =>
		cfg ? initToggles(cfg.chipSections) : {},
	);

	if (!kind || !cfg) return null;

	const viewListing = !isEdit
		? (props as BenefitTrustModalViewProps).listing
		: null;
	const benefitInfo = viewListing ? viewListing.benefits[kind] : null;

	function toggleOption(sectionId: string, optId: string) {
		setToggles((prev) => {
			const cur = new Set(prev[sectionId] ?? []);
			if (cur.has(optId)) cur.delete(optId);
			else cur.add(optId);
			return { ...prev, [sectionId]: cur };
		});
	}

	const footer = isEdit ? (
		<div className={styles.footerRow}>
			<Button variant="secondary" onClick={props.onClose}>
				Cancel
			</Button>
			<Button variant="primary" className={styles.saveBtn}>
				{cfg.saveLabel}
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
			onClose={props.onClose}
			title={cfg.title}
			headerIcon={<Icon name={cfg.icon} size={24} aria-hidden />}
			footer={footer}
			size="wide"
			closeLabel={`Close ${cfg.title.toLowerCase()} details`}
		>
			<p className={styles.subtitle}>{cfg.subtitle}</p>

			{/* ── Photo grid ────────────────────────────────────────── */}
			<section className={styles.photoSection} aria-label={cfg.photoLabel}>
				<div className={styles.photoGrid}>
					{cfg.slots.map((slot) => (
						<div
							key={slot.id}
							className={`${styles.photoSlot} ${slotClass(kind, slot.id)}`}
						>
							<div className={styles.photoArea}>
								{isEdit ? (
									<button
										type="button"
										className={styles.cameraButton}
										aria-label={`Upload ${slot.label} photo`}
									>
										<Icon name="nav.photos" size={16} aria-hidden />
									</button>
								) : null}
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
					{cfg.chipSections.map((section) => (
						<section
							key={section.id}
							className={styles.chipSection}
							aria-label={section.label}
						>
							<span className={styles.chipLabel}>{section.label}</span>
							<div className={styles.chips}>
								{section.options.map((opt) => {
									const selected = toggles[section.id]?.has(opt.id) ?? false;
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
											{opt.icon ? (
												<Icon name={opt.icon} size={16} aria-hidden />
											) : null}
											{opt.label.toUpperCase()}
										</button>
									);
								})}
								{section.allowAdd ? (
									<button
										type="button"
										className={`${styles.chip} ${styles.chipAdd}`}
									>
										+ {section.addLabel.toUpperCase()}
									</button>
								) : null}
							</div>
						</section>
					))}
				</>
			) : benefitInfo ? (
				/* ── View mode: provision + summary ─────────────────── */
				<div className={styles.viewSummary}>
					<span
						className={`${styles.provisionBadge} ${PROVISION_CLASS[benefitInfo.provision]}`}
					>
						{PROVISION_LABEL[benefitInfo.provision]}
					</span>
					{benefitInfo.summary ? (
						<p className={styles.summaryText}>{benefitInfo.summary}</p>
					) : null}
				</div>
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
