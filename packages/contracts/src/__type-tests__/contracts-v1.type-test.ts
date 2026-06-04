/**
 * Compile-time contract tests for the Contracts V1 expansion (enums,
 * lifecycles, permissions, pricing, events, retention).
 *
 * These are TYPE-LEVEL tests: validated by `tsc` during `typecheck`, they emit
 * no runtime. The file lives under src/ so it is type-checked, but is
 * intentionally NOT re-exported from src/index.ts, so it never becomes part of
 * the public API.
 */
import {
  type ActiveScope,
  type ApplicationStatus,
  type ListingCategory,
  type MarketplaceCategory,
  type MediaBucketTypeRegistry,
  type MixDomain,
  type UserScope,
} from "../enums"
import { type MediaBucketType } from "../media"
import {
  APPLICATION_TRANSITIONS,
  LIFECYCLE_EXPIRY_DAYS,
  canTransition,
  type TransitionMap,
} from "../lifecycles"
import {
  HOST_ACTIONS,
  HOST_ACTION_ROLES,
  hostRoleCan,
  type HostAction,
  type HostTeamRole,
} from "../permissions"
import {
  ADDON_PRICING,
  FOUNDER_LOCKED_PRICING,
  FOUNDING_SEAT_CAP,
  INVITE_CREDIT_PACKS,
  PLAN_ENTITLEMENTS,
} from "../pricing"
import { CORE_EVENT_TYPES, EVENT_TYPES, type EventType } from "../events"
import {
  RETENTION_POLICY,
  RETENTION_SUBJECTS,
  type RetentionSubject,
} from "../retention"

type Expect<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

/* --------------------------------------------------------------- enums */
// UserScope is an alias of ActiveScope (one source of truth).
export const _userScopeAlias: Expect<Equal<UserScope, ActiveScope>> = true
// ListingCategory is an alias of MarketplaceCategory.
export const _listingCategoryAlias: Expect<
  Equal<ListingCategory, MarketplaceCategory>
> = true

// MixDomain is the four non-mix lanes (DR-B6).
export const _mixDomain: MixDomain = "farm"
// @ts-expect-error "mix" is not a mix-domain; a mix listing matches against the four lanes (DR-B6).
const _mixNotDomain: MixDomain = "mix"
export const _mixNotDomainRejected = _mixNotDomain

// ApplicationStatus excludes "declined" (that belongs to Offer status, ADR-003).
export const _appStatus: ApplicationStatus = "accepted"
// @ts-expect-error "declined" is an Offer status, not an Application status (ADR-003).
const _declined: ApplicationStatus = "declined"
export const _declinedRejected = _declined

// The registry DB media enum is distinct from media.ts's narrower upload set.
export const _bucketTypesDiffer: Expect<
  Equal<Equal<MediaBucketTypeRegistry, MediaBucketType>, false>
> = true
export const _registryBucket: MediaBucketTypeRegistry = "profile_gallery"
// @ts-expect-error "profile_gallery" is in the registry DB enum but NOT the media.ts user-upload set.
const _uploadBucket: MediaBucketType = "profile_gallery"
export const _uploadBucketRejected = _uploadBucket

/* --------------------------------------------------------------- lifecycles */
const _appMap: TransitionMap<ApplicationStatus> = APPLICATION_TRANSITIONS
export const _appMapAssignable = _appMap
export const _appCanProgress: boolean = canTransition(
  APPLICATION_TRANSITIONS,
  "applied",
  "reviewing",
)
// Canonical expiry windows are the literal day counts.
export const _applicationExpiry: Expect<
  Equal<typeof LIFECYCLE_EXPIRY_DAYS.application, 30>
> = true
export const _inviteExpiry: Expect<
  Equal<typeof LIFECYCLE_EXPIRY_DAYS.invite, 14>
> = true
export const _offerExpiry: Expect<
  Equal<typeof LIFECYCLE_EXPIRY_DAYS.offer, 7>
> = true

/* --------------------------------------------------------------- permissions */
export const _role: HostTeamRole = "hiring_manager"
export const _action: HostAction = "manage_billing"
export const _ownerManagesTeam: boolean = hostRoleCan("owner", "manage_team")
// Every action has an entry in the action->roles matrix.
export const _actionMatrixComplete =
  Object.keys(HOST_ACTION_ROLES).length === HOST_ACTIONS.length
// @ts-expect-error "recruiter" is a retired legacy role; it maps forward to hiring_manager (DR-B5).
const _legacyRole: HostTeamRole = "recruiter"
export const _legacyRoleRejected = _legacyRole

/* --------------------------------------------------------------- pricing */
export const _starterMonthly: number = FOUNDER_LOCKED_PRICING.starter.monthly
export const _seatCap: Expect<Equal<typeof FOUNDING_SEAT_CAP, 100>> = true
export const _boost7: number = ADDON_PRICING.boost.d7
export const _threePacks = INVITE_CREDIT_PACKS.length === 3
export const _entitlementTiers: Expect<
  Equal<keyof typeof PLAN_ENTITLEMENTS, "starter" | "professional" | "enterprise">
> = true

/* --------------------------------------------------------------- events */
export const _event: EventType = "offer_accepted"
// @ts-expect-error not a name in the Canonical Event Registry.
const _badEvent: EventType = "totally_made_up_event"
export const _badEventRejected = _badEvent
// scope_changed is retained for back-compat only (not in the registry).
export const _coreEvent: (typeof CORE_EVENT_TYPES)[number] = "scope_changed"
export const _catalogueNonEmpty = EVENT_TYPES.length > 0

/* --------------------------------------------------------------- retention */
export const _subject: RetentionSubject = "financial_records"
// Every retention subject has a policy entry (ADR-041).
export const _retentionComplete: Expect<
  Equal<keyof typeof RETENTION_POLICY, RetentionSubject>
> = true
export const _retentionCountMatches =
  Object.keys(RETENTION_POLICY).length === RETENTION_SUBJECTS.length
