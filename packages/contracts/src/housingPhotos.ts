import type { OpportunityCategory } from "./categories";

/** Fixed evidence roles. Labels may adapt by category; these identifiers never do. */
export const HOUSING_PHOTO_ROLES = [
	"sleeping_area",
	"bathroom",
	"kitchen",
	"dining_common",
] as const;

export type HousingPhotoRole = (typeof HOUSING_PHOTO_ROLES)[number];
export type HousingPhotoMap = Partial<Record<HousingPhotoRole, string>>;

export interface HostBenefitLibrary {
	readonly housing?: {
		readonly photos?: HousingPhotoMap;
	};
}

export type HousingPhotoSource = "profile" | "listing";

export interface EffectiveHousingPhoto {
	readonly role: HousingPhotoRole;
	readonly url: string;
	readonly source: HousingPhotoSource;
}

const GENERIC_LABELS: Record<HousingPhotoRole, string> = {
	sleeping_area: "Sleeping area",
	bathroom: "Bathroom",
	kitchen: "Kitchen",
	dining_common: "Dining/common area",
};

const MARITIME_LABELS: Record<HousingPhotoRole, string> = {
	sleeping_area: "Cabin/berth",
	bathroom: "Head",
	kitchen: "Galley",
	dining_common: "Mess",
};

/** Keep only known roles carrying non-empty strings. Unknown data is not evidence. */
export function sanitizeHousingPhotoMap(value: unknown): HousingPhotoMap {
	if (!value || typeof value !== "object") return {};
	const input = value as Record<string, unknown>;
	const photos: HousingPhotoMap = {};
	for (const role of HOUSING_PHOTO_ROLES) {
		const raw = input[role];
		if (typeof raw !== "string") continue;
		const url = raw.trim();
		if (url) photos[role] = url;
	}
	return photos;
}

/** Parse the persisted host_profiles.benefit_library JSONB fail-closed. */
export function sanitizeHostBenefitLibrary(value: unknown): HostBenefitLibrary {
	if (!value || typeof value !== "object") return {};
	const root = value as Record<string, unknown>;
	const housing = root.housing;
	if (!housing || typeof housing !== "object") return {};
	const photos = sanitizeHousingPhotoMap(
		(housing as Record<string, unknown>).photos,
	);
	return Object.keys(photos).length > 0 ? { housing: { photos } } : {};
}

/** Profile defaults first, listing values second. Only allow-listed roles survive. */
export function resolveEffectiveHousingPhotos(
	library: HostBenefitLibrary | undefined,
	listingOverrides: HousingPhotoMap | undefined,
): readonly EffectiveHousingPhoto[] {
	const defaults = sanitizeHousingPhotoMap(library?.housing?.photos);
	const overrides = sanitizeHousingPhotoMap(listingOverrides);
	return HOUSING_PHOTO_ROLES.flatMap<EffectiveHousingPhoto>((role) => {
		const override = overrides[role];
		if (override) return [{ role, url: override, source: "listing" as const }];
		const inherited = defaults[role];
		return inherited
			? [{ role, url: inherited, source: "profile" as const }]
			: [];
	});
}

export function effectiveHousingPhotoMap(
	library: HostBenefitLibrary | undefined,
	listingOverrides: HousingPhotoMap | undefined,
): HousingPhotoMap {
	return Object.fromEntries(
		resolveEffectiveHousingPhotos(library, listingOverrides).map((photo) => [
			photo.role,
			photo.url,
		]),
	) as HousingPhotoMap;
}

export function missingHousingPhotoRoles(
	photos: HousingPhotoMap | undefined,
): readonly HousingPhotoRole[] {
	const clean = sanitizeHousingPhotoMap(photos);
	return HOUSING_PHOTO_ROLES.filter((role) => !clean[role]);
}

export function housingPhotoLabel(
	role: HousingPhotoRole,
	category: OpportunityCategory | string | undefined,
): string {
	return (category === "maritime" ? MARITIME_LABELS : GENERIC_LABELS)[role];
}

export function housingPhotoSlots(
	category: OpportunityCategory | string | undefined,
): ReadonlyArray<{ readonly id: HousingPhotoRole; readonly label: string }> {
	return HOUSING_PHOTO_ROLES.map((role) => ({
		id: role,
		label: housingPhotoLabel(role, category),
	}));
}
