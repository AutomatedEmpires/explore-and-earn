// Public API of the media module: uploads, scanning and media URLs. Owned by W7 (Tasks 20-21).
import type { HandlerMap } from '@/modules/jobs';

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
  requestUpload,
  uploadRequestSchema,
  type UploadActor,
  type UploadRequest,
} from './uploads';

export const jobHandlers: HandlerMap = {};
