# Community Phase 2 — Real Photos & Host Announcements

**Date:** 2026-06-12  
**Status:** Approved — pending implementation  
**Scope:** Seeker photo posting + host announcement system (included tier + Stripe purchase)  
**Approval gates exercised:** Stripe (founder-approved this session)

---

## 1. Problem & Goals

The community feed currently renders 100% fixture data. This spec wires it to real DB-backed content:

1. **Seeker photos** — logged-in seekers with ≥ 80% profile completion can post a photo with caption and optional location tag. Photos appear in the Photos tab and the main feed.
2. **Host announcements** — hosts can post timed announcements. Professional tier gets 1/mo free; Enterprise gets 3/mo free. Starter hosts (or anyone over quota) purchase a timed slot via Stripe one-time payment (7 d / $150, 14 d / $250, 28 d / $350).

### Non-goals (explicitly out of scope)
- Seeker-to-seeker commenting
- Photo moderation queue (manual admin review is enough for now)
- Video uploads
- Announcement editing after publish
- Announcement purchase refunds (handled by billing support, not the UI)

---

## 2. Live DB Audit (verified 2026-06-12)

| Column | Table | Exists | Notes |
|---|---|---|---|
| `seeker_profiles.id` | seeker_profiles | ✅ | uuid PK |
| `seeker_profiles.clerk_user_id` | seeker_profiles | ✅ | text, nullable |
| `seeker_profiles.completion_score` | seeker_profiles | ✅ | integer, default 0 |
| `host_profiles.id` | host_profiles | ✅ | uuid PK |
| `host_profiles.clerk_user_id` | host_profiles | ✅ | text, nullable |
| `host_profiles.subscription_tier` | host_profiles | ✅ | text, default 'none' |
| Storage bucket `community-photos` | storage | ❌ | Must create in migration |
| `community_photos` table | public | ❌ | New in migration 031 |
| `host_announcements` table | public | ❌ | New in migration 031 |

Live DB is at migration **030** (`seeker_badges`). New migration will be **031**.

---

## 3. Database Schema — Migration 031

### 3.1 Storage bucket

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-photos',
  'community-photos',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/webp','image/png']
);
```

### 3.2 `community_photos` table

```sql
CREATE TABLE community_photos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_profile_id uuid        NOT NULL REFERENCES seeker_profiles(id) ON DELETE CASCADE,
  storage_path      text        NOT NULL,
  caption           text,
  location_tag      text,
  status            text        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'removed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Feed query: most recent active photos first
CREATE INDEX idx_community_photos_feed
  ON community_photos (created_at DESC)
  WHERE status = 'active';

-- Ownership lookup for delete gate
CREATE INDEX idx_community_photos_seeker
  ON community_photos (seeker_profile_id);
```

RLS:
- **SELECT**: any authenticated user can read active photos
- **INSERT**: seeker must own the `seeker_profile_id` (via `clerk_user_id` join) AND `completion_score >= 80` — enforced in server action, not RLS, to return a typed error
- **DELETE**: seeker must own the photo row (server action gate); admins use service role

### 3.3 `host_announcements` table

```sql
CREATE TABLE host_announcements (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id           uuid        NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,
  title                     text        NOT NULL,
  body                      text        NOT NULL,
  kind                      text        NOT NULL DEFAULT 'general'
                            CHECK (kind IN ('general', 'hiring', 'event')),
  expires_at                timestamptz NOT NULL,
  status                    text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('draft', 'active', 'removed')),

  -- Null for included-tier posts; set for Stripe-purchased posts
  stripe_payment_intent_id  text,
  purchase_duration_days    integer,
  purchase_amount_cents     integer,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Feed query: active, not expired, newest first
CREATE INDEX idx_host_announcements_feed
  ON host_announcements (created_at DESC)
  WHERE status = 'active' AND expires_at > now();

-- Quota check: count announcements this month per host
CREATE INDEX idx_host_announcements_host_month
  ON host_announcements (host_profile_id, created_at);
```

RLS:
- **SELECT**: any authenticated user can read active non-expired announcements
- **INSERT**: host must own the `host_profile_id`; quota and tier checks enforced in server action

---

## 4. New Contracts — `packages/contracts/src/community.ts`

```ts
export const ANNOUNCEMENT_DURATIONS = [7, 14, 28] as const;
export type AnnouncementDuration = (typeof ANNOUNCEMENT_DURATIONS)[number];

export const ANNOUNCEMENT_PRICING: Record<AnnouncementDuration, number> = {
  7:  15000,  // cents
  14: 25000,
  28: 35000,
};

// Included-tier announcements expire after this many days
export const ANNOUNCEMENT_FREE_DURATION_DAYS = 30;

// Tier entitlements (free posts per calendar month)
export const ANNOUNCEMENT_MONTHLY_QUOTA: Record<string, number> = {
  none:         0,
  starter:      0,
  professional: 1,
  enterprise:   3,
};

export interface CommunityPhoto {
  readonly id: string;
  readonly seekerProfileId: string;
  readonly authorName: string;       // joined from seeker_profiles.display_name
  readonly storageUrl: string;       // public URL from storage
  readonly caption: string | null;
  readonly locationTag: string | null;
  readonly createdAt: string;        // ISO timestamp
}

export interface HostAnnouncement {
  readonly id: string;
  readonly hostProfileId: string;
  readonly hostName: string;         // joined from host_profiles.company_name
  readonly title: string;
  readonly body: string;
  readonly kind: 'general' | 'hiring' | 'event';
  readonly expiresAt: string;        // ISO timestamp
  readonly createdAt: string;
  readonly isPurchased: boolean;     // stripe_payment_intent_id is set
}
```

Export from `packages/contracts/src/index.ts`.

---

## 5. DB Query Module — `packages/db/src/queries/community.ts`

All functions use the caller-supplied JWT token for RLS; admin operations use `adminClient()`.

| Function | Purpose |
|---|---|
| `getSeekerCompletionScore(token, clerkUserId)` | Returns `{ seekerProfileId, completionScore }` or null |
| `getHostTierAndProfile(token, clerkUserId)` | Returns `{ hostProfileId, subscriptionTier }` or null |
| `countHostAnnouncementsThisMonth(token, hostProfileId)` | Count rows in current calendar month |
| `getFeedPhotos(token, cursor?)` | 20 active photos DESC, with author name |
| `getFeedAnnouncements(token)` | All active, non-expired announcements with host name |
| `insertCommunityPhoto(adminClient, row)` | Insert; returns new row |
| `deleteCommunityPhoto(adminClient, photoId)` | Soft-delete (status = 'removed') |
| `insertHostAnnouncement(adminClient, row)` | Insert; returns new row |
| `activateHostAnnouncement(adminClient, draftId, { title, body, kind })` | Update draft → active |
| `getLatestDraftAnnouncement(token, hostProfileId)` | Returns most recent draft row id for this host, or null |

Export all from `packages/db/src/index.ts`.

---

## 6. Server Actions — `apps/web/app/actions/community.ts`

### 6.1 `uploadCommunityPhotoAction(fd: FormData)`

```
1. Resolve auth (userId + Supabase token)
2. getSeekerCompletionScore → if null, return { ok: false, reason: 'not_seeker' }
3. if completionScore < 80 → return { ok: false, reason: 'incomplete_profile', score: completionScore }
4. Validate file: max 10 MB, allowed mime types
5. Upload to Supabase storage: `community-photos/{seekerProfileId}/{uuid}.{ext}`
6. insertCommunityPhoto via adminClient
7. revalidatePath('/community')
8. return { ok: true, photoId }
```

### 6.2 `deleteCommunityPhotoAction(photoId: string)`

```
1. Resolve auth
2. getSeekerCompletionScore (proves seeker identity + gets seekerProfileId)
3. Fetch photo row; verify seeker_profile_id matches
4. deleteCommunityPhoto via adminClient
5. Delete from storage
6. revalidatePath('/community')
7. return { ok: true }
```

### 6.3 `postHostAnnouncementAction(fd: FormData)`

Handles **included-tier free posts only** (Pro/Enterprise within quota).

```
1. Resolve auth
2. getHostTierAndProfile → if null, return { ok: false, reason: 'not_host' }
3. countHostAnnouncementsThisMonth
4. Compute quota = ANNOUNCEMENT_MONTHLY_QUOTA[subscriptionTier]
5. if count >= quota → return { ok: false, reason: 'quota_exceeded', purchaseRequired: true }
6. Validate: title (max 80 chars), body (max 500 chars), kind
7. expires_at = now() + ANNOUNCEMENT_FREE_DURATION_DAYS days
8. insertHostAnnouncement via adminClient (status = 'active')
9. revalidatePath('/community')
10. return { ok: true, announcementId }
```

### 6.4 `activateDraftAnnouncementAction(draftId: string, fd: FormData)`

Handles **post-Stripe-purchase content fill**. The draft row was created by the webhook.

```
1. Resolve auth
2. getHostTierAndProfile
3. Fetch host_announcements row by draftId; verify host_profile_id ownership
4. Verify status = 'draft'; if not, return { ok: false, reason: 'already_active' }
5. Validate: title, body, kind (same rules as §6.3)
6. UPDATE host_announcements SET title, body, kind, status='active', updated_at=now()
7. revalidatePath('/community')
8. return { ok: true }
```

### 6.5 `createAnnouncementCheckoutAction(durationDays: AnnouncementDuration)`

```
1. Resolve auth
2. getHostTierAndProfile → if null, return { ok: false, reason: 'not_host' }
3. createAnnouncementCheckoutSession({ clerkUserId, hostProfileId, durationDays })
4. return { ok: true, sessionUrl }
```

---

## 7. Stripe — One-time Announcement Purchases

### 7.1 New env vars

```
STRIPE_PRICE_ANNOUNCEMENT_7D=price_...
STRIPE_PRICE_ANNOUNCEMENT_14D=price_...
STRIPE_PRICE_ANNOUNCEMENT_28D=price_...
```

Create manually in Stripe dashboard as one-time prices.

### 7.2 New function in `apps/web/services/stripe/index.ts`

```ts
export async function createAnnouncementCheckoutSession(params: {
  clerkUserId: string;
  hostProfileId: string;
  durationDays: AnnouncementDuration;
}): Promise<Stripe.Checkout.Session>
```

- `mode: 'payment'`
- `line_items`: quantity 1, price from env var map keyed by `durationDays`
- `metadata`: `{ productType: 'announcement', hostProfileId, clerkUserId, durationDays: String(durationDays) }`
- `success_url`: `/community?tab=announcements&purchased=1`
- `cancel_url`: `/community?tab=announcements`

### 7.3 Webhook extension — `syncCheckoutCompleted`

In `apps/web/services/stripe/index.ts`, extend `syncCheckoutCompleted`:

```
if session.metadata.productType === 'announcement':
  hostProfileId = session.metadata.hostProfileId
  durationDays = parseInt(session.metadata.durationDays)
  expiresAt = now + durationDays days
  insertHostAnnouncement(adminClient, {
    hostProfileId,
    title: 'Announcement',   // host fills title in a pre-checkout form
    body: '',                 // same — see §8.2 on pre-checkout form
    kind: 'general',
    expiresAt,
    stripePaymentIntentId: session.payment_intent,
    purchaseDurationDays: durationDays,
    purchaseAmountCents: ANNOUNCEMENT_PRICING[durationDays],
    status: 'draft',         // host fills content post-purchase
  })
  return { action: 'created_announcement', clerkUserId, tier: null }
```

> **Why draft?** Stripe webhooks fire before the user sees the success page. The host completes announcement content in a post-purchase step (see §8.2), so the row starts as `draft` and is activated on content save.

Add `'draft'` to the `status` CHECK constraint in migration 031.

---

## 8. UI Components

### 8.1 Seeker Photo Upload — `CommunityDashboard.tsx` Photos tab

The existing `PhotosTab` scaffold (currently shows static grid) becomes:

**If not logged in:** sign-in prompt  
**If `completionScore < 80`:** gate card with progress bar  
- Message: "Complete your profile to post photos"  
- Subtext: "You need 80% profile completion (currently {score}%). Add your bio and experience to unlock."  
- CTA: link to `/profile/edit`

**If gate passes:** photo upload form above the grid  
- `<input type="file" accept="image/jpeg,image/webp,image/png">` (max 10 MB, validated client-side before submit)  
- Caption textarea (max 280 chars, character counter)  
- Location tag input (optional, max 100 chars, placeholder "Tillamook, OR")  
- Submit button: calls `uploadCommunityPhotoAction`  
- Optimistic: add placeholder card immediately; replace on success; remove on error  
- Success: toast "Photo posted!"  
- Error: inline error below form  

**Photo grid:** server-rendered `CommunityPhoto[]` prop; existing polaroid masonry + lightbox.

### 8.2 Host Announcement Composer — new component `HostAnnouncementComposer.tsx`

Lives in `apps/web/components/host/HostAnnouncementComposer.tsx`.  
Used in the host dashboard community section (or inline at `/host/announcements`).

**Quota-available state** (Pro or Enterprise within monthly quota):  
- Title field (max 80 chars)  
- Body textarea (max 500 chars)  
- Kind selector: General / Hiring / Event  
- Quota badge: "1 of 1 free post remaining this month"  
- Submit → `postHostAnnouncementAction`

**Purchase state** (Starter, or quota exhausted):  
- Pricing cards for 3 options:
  ```
  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │  7-Day Boost    │  │ 14-Day Spotlight │  │  28-Day Feature  │
  │    $150         │  │     $250         │  │     $350         │
  │ Reach seekers   │  │ Double coverage  │  │ Max visibility   │
  │ for a full week │  │ over two weeks   │  │ for a full month │
  └─────────────────┘  └─────────────────┘  └─────────────────┘
  ```
- Selecting a card → `createAnnouncementCheckoutAction(durationDays)` → redirect to Stripe Checkout  
- After return from Stripe (`?purchased=1`): the community page server-renders with `getLatestDraftAnnouncement` to resolve `draftId`, then passes it to the composer. Shows "Your announcement slot is ready — add your content" form.  
  - Same title/body/kind fields as above  
  - Submit → `activateDraftAnnouncementAction(draftId, fd)` (activates the draft row created by webhook)

> **Alt flow consideration:** The pre-Stripe title/body-then-pay flow was rejected because webhook timing is unreliable. Draft-on-webhook + fill-post-return is simpler and avoids lost content.

### 8.3 `CommunityDashboard.tsx` — real feed data

The server wrapper page (`/community/page.tsx`) fetches:

```ts
const [photos, announcements] = await Promise.all([
  getFeedPhotos(token),
  getFeedAnnouncements(token),
]);
```

These are mapped into `FeedItem[]` (existing types in `CommunityDashboard.tsx`) and passed as a new `serverFeedItems` prop. The client component merges them with the existing blog/listing fixtures using a deterministic interleave order:

```
1 announcement (if any) → 2 seeker posts → 1 featured listing → 2 seeker posts → repeat
```

If no real data: fall back to existing fixture behavior (no regressions for dev/preview).

---

## 9. Files Created / Modified

### New files
| Path | Purpose |
|---|---|
| `supabase/migrations/031_community_phase2.sql` | Storage bucket + 2 tables + indexes |
| `packages/contracts/src/community.ts` | `CommunityPhoto`, `HostAnnouncement`, pricing constants |
| `packages/db/src/queries/community.ts` | All DB query functions |
| `apps/web/app/actions/community.ts` | 5 server actions (upload, delete photo; post free announcement; activate draft; create checkout) |
| `apps/web/components/host/HostAnnouncementComposer.tsx` | Host announcement form + Stripe pricing cards |
| `apps/web/components/host/HostAnnouncementComposer.module.css` | Styles |

### Modified files
| Path | Change |
|---|---|
| `packages/contracts/src/index.ts` | Export community types |
| `packages/db/src/index.ts` | Export community queries |
| `apps/web/services/stripe/index.ts` | Add `createAnnouncementCheckoutSession`; extend `syncCheckoutCompleted` for announcements |
| `apps/web/components/seeker/CommunityDashboard.tsx` | Accept `serverFeedItems` + `completionScore` props; real photo upload; real feed interleave |
| `apps/web/app/(seeker)/community/page.tsx` | Fetch real photos + announcements; pass to dashboard |

---

## 10. Error Handling

| Error | Surface | Handling |
|---|---|---|
| Upload > 10 MB | Photo upload form | Client-side reject before server round-trip |
| Unsupported mime type | Photo upload form | Client-side reject |
| `incomplete_profile` (score < 80) | Photo upload | Inline gate message replaces form |
| `quota_exceeded` | Announcement form | Purchase pricing cards appear |
| Stripe checkout error | Action return | Toast "Payment setup failed — try again" |
| Webhook delivery failure | Background | `host_announcements` stays in `draft` — host sees "Your slot is ready — add content" prompt on return |
| Storage upload failure | Photo upload | Error toast; no DB row inserted (upload first, then insert) |

---

## 11. Open Questions (resolved)

- **Completion threshold**: 80% (matches application gate — same rule, same UX message)
- **Announcement duration**: 7/14/28 days (founder choice)  
- **Announcement pricing**: $150/$250/$350 (founder choice)  
- **Starter free quota**: 0 (Starter can only purchase)  
- **Upload storage**: Supabase storage (not Cloudinary — Cloudinary is for curated library only)  
- **Photo moderation**: admin `status='removed'` via admin panel (existing) — no automated moderation in scope  
- **Announcement content timing**: draft-on-webhook + fill-post-return (not pre-Stripe form, avoids lost content on webhook delay)

---

## 12. Acceptance Criteria

1. A seeker with `completion_score < 80` sees the gate and cannot upload
2. A seeker with `completion_score >= 80` can upload a photo; it appears in the feed and photos tab
3. A Professional host with 0 announcements this month can post one for free
4. A Professional host at quota sees the pricing cards
5. A Starter host always sees the pricing cards
6. Purchasing 7/14/28 days creates a Stripe Checkout; on return the host fills content and activates
7. Published announcements appear in the community feed until `expires_at`
8. Expired or removed announcements do not appear in the feed
9. The feed degrades gracefully (fixture fallback) when DB is unavailable or in dev without env config
