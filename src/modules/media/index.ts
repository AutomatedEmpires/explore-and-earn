// Public API of the media module: uploads, scanning and media URLs. Owned by W7 (Tasks 20-21).
import type { HandlerMap } from '@/modules/jobs';
import { registerSubjectHandlers } from '@/modules/trust';
import { createMediaSubjectHandlers, mediaJobHandlers } from './scan';
import { getStorage } from './storage';

export {
  ALT_TEXT_KINDS,
  BUCKETS,
  canonicalMime,
  IMAGE_MIMES,
  KIND_RULES,
  MEDIA_KINDS,
  MEDIA_STATUSES,
  PRIVATE_KINDS,
  VARIANT_WIDTHS,
  type AllowedMime,
  type Bucket,
  type ImageMime,
  type KindRule,
  type MediaKind,
  type MediaStatus,
  type RejectionReason,
  type VariantWidth,
} from './kinds';

export {
  getStorage,
  isSafeObjectPath,
  LOCAL_ROUTE,
  localStorage,
  memoryStorage,
  ObjectNotFoundError,
  signLocalToken,
  supabaseStorage,
  verifyLocalToken,
  type LocalStorageOptions,
  type LocalTokenPurpose,
  type MemoryStorage,
  type ObjectRef,
  type Storage,
  type SupabaseStorageOptions,
} from './storage';

export {
  completeUpload,
  isUuid,
  requestUpload,
  SCAN_TOPIC,
  uploadRequestSchema,
  type UploadActor,
  type UploadRequest,
} from './uploads';

export {
  approveHeldMedia,
  CLEANUP_TOPIC,
  createMediaSubjectHandlers,
  defaultScanDeps,
  destinationBucket,
  removeMedia,
  scanMedia,
  UNSCANNABLE_REASON,
  variantPaths,
  type ScanDeps,
} from './scan';

export {
  cloudmersiveScanner,
  getChildSafetyScanner,
  getMalwareScanner,
  photoDnaScanner,
  stubChildSafetyScanner,
  stubMalwareScanner,
  UnscannableImageError,
  type ChildSafetyScanner,
  type CloudmersiveOptions,
  type MalwareScanner,
  type PhotoDnaOptions,
} from './scanners';

export { getMediaUrl, SIGNED_URL_TTL_SEC, type MediaViewer } from './urls';

export { getMediaInfo, readMediaVariant, type MediaInfo } from './info';

/** `media.scan` (queued by completeUpload) and `media.cleanup` (deletes superseded copies). */
export const jobHandlers: HandlerMap = mediaJobHandlers;

// Operator decisions on a review item whose subject is `media`: approve publishes a held file
// (or a kept rejected one, when an appeal or an accuracy sample overturns the rejection);
// remove takes a file down and keeps a private copy, or on a blocked file confirms the block.
registerSubjectHandlers('media', createMediaSubjectHandlers(getStorage));
