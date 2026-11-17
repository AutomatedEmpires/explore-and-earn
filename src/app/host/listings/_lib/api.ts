// The builder's calls to the SP2 host API (no new contracts): listings, drafts, checks,
// publish, locations, team, the AI description and media uploads. Errors keep the server's
// code and `details.reason`; a request that never reached the server is `offline`.
import type { ChecklistEntry, Issue, ListingEditor, ListingRow } from '@/modules/listings';
import type { BuilderSection } from '@/modules/listings';
import type { Json } from './paths';

/** What a type looks like after JSON: dates become strings. */
type Wire<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

export type ListingRowJson = Wire<ListingRow>;
export type EditorJson = Omit<Wire<ListingEditor>, 'draft'> & { draft: Json };
export type ChecklistJson = ChecklistEntry[];
export type IssueJson = Issue;
export type ChecksJson = {
  errors: Issue[];
  warnings: Issue[];
  slot: { used: number; limit: number };
};
export type PublishJson = {
  state: ListingRow['state'];
  reviewStage: ListingRow['reviewStage'];
};
export type LocationJson = {
  id: string;
  name: string;
  city: string;
  state: string;
  archived?: boolean;
};
export type MemberJson = {
  userId: string;
  displayName: string | null;
  email: string | null;
  role?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason: string | undefined;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    const reason =
      typeof details === 'object' && details !== null && 'reason' in details
        ? (details as { reason: unknown }).reason
        : undefined;
    this.reason = typeof reason === 'string' ? reason : undefined;
  }

  /** The request never reached the server (no network). */
  get offline(): boolean {
    return this.status === 0;
  }

  /** `details.issues` of a 400 from publish. */
  get issues(): Issue[] {
    const d = this.details;
    if (typeof d === 'object' && d !== null && 'issues' in d && Array.isArray(d.issues)) {
      return d.issues as Issue[];
    }
    return [];
  }
}

export const OFFLINE_MESSAGE = 'You are offline.';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', OFFLINE_MESSAGE);
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error =
      typeof json === 'object' && json !== null && 'error' in json
        ? (json.error as { code?: string; message?: string; details?: unknown })
        : {};
    throw new ApiError(
      res.status,
      error.code ?? 'internal',
      error.message ?? 'Something went wrong.',
      error.details,
    );
  }
  return json as T;
}

const listing = (id: string) => `/api/v1/host/listings/${encodeURIComponent(id)}`;

export const api = {
  listListings: (tab: 'active' | 'drafts' | 'library') =>
    call<{
      items: ListingRowJson[];
      nextBefore: string | null;
      slots: { used: number; limit: number };
    }>('GET', `/api/v1/host/listings?tab=${tab}`),
  createListing: (
    input:
      { start: 'blank' } | { start: 'copy'; listingId: string } | { start: 'paste'; text: string },
  ) =>
    call<{ id: string; openSection: BuilderSection | 'review' }>(
      'POST',
      '/api/v1/host/listings',
      input,
    ),
  getEditor: (id: string) => call<EditorJson>('GET', listing(id)),
  patchDraft: (id: string, body: { section: BuilderSection; baseVersion: number; data: Json }) =>
    call<{
      draftVersion: number;
      sectionVersions: Partial<Record<BuilderSection, number>>;
      checklist: ChecklistJson;
    }>('PATCH', `${listing(id)}/draft`, body),
  checks: (id: string) => call<ChecksJson>('POST', `${listing(id)}/checks`, {}),
  publish: (id: string, acknowledgedWarnings: string[]) =>
    call<PublishJson>('POST', `${listing(id)}/publish`, { acknowledgedWarnings }),
  describe: (id: string, bullets: string[]) =>
    call<{ description: string }>('POST', `${listing(id)}/ai/description`, { bullets }),
  locations: () => call<LocationJson[]>('GET', '/api/v1/host/locations'),
  addLocation: (input: { city: string; state: string; line1?: string }) =>
    call<LocationJson>('POST', '/api/v1/host/locations', {
      name: `${input.city}, ${input.state}`,
      kind: 'business_site',
      address: { line1: input.line1 || undefined, city: input.city, state: input.state },
      publicPrecision: 'city',
    }),
  team: () => call<{ members: MemberJson[] }>('GET', '/api/v1/host/team'),
  mediaUrl: (id: string) =>
    call<{ url: string }>('GET', `/api/v1/media/${encodeURIComponent(id)}/url?variant=640`),
};

// --- Uploads (spec section 7): signed URL, the bytes, then "complete" queues the scan. -------

export type PhotoKind = 'listing_photo' | 'housing_photo' | 'meal_photo';

const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

/** Why a file can't be uploaded as a photo, in words for the host, or null. */
export function photoProblem(file: Blob): string | null {
  if (!PHOTO_MIMES.includes(file.type)) return 'Use a JPEG, PNG, WebP or HEIC photo.';
  if (file.size > PHOTO_MAX_BYTES) return 'Use a photo under 15 MB.';
  if (file.size === 0) return 'This photo is empty. Take it again.';
  return null;
}

/** Uploads one photo and returns its media id. Throws ApiError. */
export async function uploadPhoto(file: Blob, kind: PhotoKind): Promise<string> {
  const { mediaId, uploadUrl } = await call<{ mediaId: string; uploadUrl: string; token: string }>(
    'POST',
    '/api/v1/media/uploads',
    { kind, mime: file.type, sizeBytes: file.size },
  );
  let put: Response;
  try {
    put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'offline', OFFLINE_MESSAGE);
  }
  if (!put.ok) throw new ApiError(put.status, 'upload_failed', "The photo didn't upload.");
  await call<undefined>('POST', `/api/v1/media/uploads/${encodeURIComponent(mediaId)}/complete`);
  return mediaId;
}
