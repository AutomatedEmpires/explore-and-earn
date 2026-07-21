export type BenefitPhotoSessionKind = "housing" | "meals";

export interface TrackedBenefitPhotoUpload {
	readonly listingId: string;
	readonly kind: BenefitPhotoSessionKind;
	readonly slot: string;
	readonly url: string;
}

function slotKey(upload: Pick<TrackedBenefitPhotoUpload, "listingId" | "kind" | "slot">) {
	return `${upload.listingId}\u0000${upload.kind}\u0000${upload.slot}`;
}

/** In-memory ownership ledger for uploads created during one open edit session. */
export class BenefitPhotoSessionLedger {
	readonly #uploads = new Map<string, TrackedBenefitPhotoUpload>();
	readonly #currentBySlot = new Map<string, string>();

	track(upload: TrackedBenefitPhotoUpload): TrackedBenefitPhotoUpload | undefined {
		const key = slotKey(upload);
		const previousUrl = this.#currentBySlot.get(key);
		this.#uploads.set(upload.url, upload);
		this.#currentBySlot.set(key, upload.url);
		return previousUrl && previousUrl !== upload.url
			? this.#uploads.get(previousUrl)
			: undefined;
	}

	removeCurrent(
		listingId: string,
		kind: BenefitPhotoSessionKind,
		slot: string,
	): TrackedBenefitPhotoUpload | undefined {
		const key = slotKey({ listingId, kind, slot });
		const url = this.#currentBySlot.get(key);
		this.#currentBySlot.delete(key);
		return url ? this.#uploads.get(url) : undefined;
	}

	forget(url: string): void {
		const upload = this.#uploads.get(url);
		if (!upload) return;
		const key = slotKey(upload);
		if (this.#currentBySlot.get(key) === url) this.#currentBySlot.delete(key);
		this.#uploads.delete(url);
	}

	stale(): readonly TrackedBenefitPhotoUpload[] {
		return Array.from(this.#uploads.values()).filter(
			(upload) => this.#currentBySlot.get(slotKey(upload)) !== upload.url,
		);
	}

	all(): readonly TrackedBenefitPhotoUpload[] {
		return Array.from(this.#uploads.values());
	}

	clear(): void {
		this.#uploads.clear();
		this.#currentBySlot.clear();
	}
}
