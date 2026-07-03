# Community Dashboard — Premium Restyle Plan

Executable companion to `COMMUNITY_DASHBOARD_AUDIT.md`. Every item names real files. The plan is **presentational + additive only** — no server actions, queries, contracts, migrations, permission conditions, or form field names change.

---

## 1. Design direction

A **premium field-journal social hub**: warm paper surfaces, ink hairlines, hand-drawn photo frames, tape/push-pin texture for "official" posts — lifted by the locked V2 **"Adventure Paper & Sky"** brand (sky `--color-cta`, gold `--color-gold`). Community keeps its **green accent** as the section identity, but borrows **gold** for premium/promoted/official treatments so the hierarchy reads instantly.

Three voices, one system:
- **Feed** = warm, social, scannable (Instagram energy on paper).
- **Photos** = immersive memory wall (polaroids, tape, lightbox).
- **Announcements** = official, high-trust (LinkedIn clarity, tape-pinned, gold for promoted/official).

Non-negotiables: mobile-first 375px-up; tokens only; `<Icon>` only; frame-not-filter; every permission gate preserved.

---

## 2. Mobile-first layout strategy

- Single column < 860px; two-column (feed + 288px aside) ≥ 860px (unchanged grid).
- **Fix mobile content loss:** stop `display:none`-ing the aside widgets. Render Popular Tags / Upcoming Listings / Help inside a mobile-ordered block below the feed (or keep the `MobileProfileStrip` and append a compact "community widgets" row), so no content disappears on phones.
- Keep the XP identity visible on mobile in a compacted form instead of hiding the whole `xpGroup` < 600px.
- All tap targets ≥ 44px (`--tap-min`). Reaction bar already full-width; keep.
- Container rhythm via `--space-*`; edge-to-edge hero, 16px gutters for content.

---

## 3. Community information architecture

```
Community shell
├── CommunityHeader (NEW)   — section-aware hero: mission + active section label + primary action
├── WelcomeBar (kept, compacted) — personal XP/level strip
├── CommunityTabNav (kept)  — Feed · Photos · Announcements
├── MobileProfileStrip (kept)
└── layout
    ├── main
    │   ├── SectionIntro (NEW, photos/announcements) — what this space is + CTA
    │   ├── composer (feed: ShareComposer · photos: PhotoUploadForm · announcements: HostAnnouncementComposer)
    │   ├── Skeletons (NEW) while empty/loading
    │   └── cards / masonry / empty state
    └── aside (kept; mobile-restored)
```

---

## 4. Route-by-route UX strategy

**Feed** — Lead with `CommunityHeader` ("The Explore&Earn community"). Keep interleaved feed. Surface promoted announcements with gold. Dignify real (image-less) announcements. Strengthen the end marker + empty state.

**Photos** — `CommunityHeader` ("Photos") + `SectionIntro` ("Share moments from the field"). **Fix the upload composer surface** (top defect). Masonry stays; add a hover affordance hinting reactions/lightbox. Skeletons while loading. On-brand empty state with "Add the first photo".

**Announcements** — `CommunityHeader` ("Announcements") + `SectionIntro` that differs by role: hosts → "Post seasonal openings…"; seekers → "Official updates & hiring from verified hosts." Promoted/official treatment. Host composer polished.

---

## 5. Feed strategy

- `PostCard` polish: tighter header rhythm, clearer badges via `CommunityBadge`.
- **Promoted announcement:** when `isPurchased`, add a gold "Promoted" eyebrow + warmer border; pass `isPurchased` through `announcementsToFeedItems` (currently dropped) into `AnnouncementCard`.
- **Image-less real announcement:** render a refined text-first body (megaphone framing already exists) so absence of photos looks intentional, not broken.
- Keep slot template + merge logic; only the card rendering changes.

---

## 6. Photos / gallery strategy

- Replace phantom-token form CSS with real tokens: `--color-card-warm` surface, `--radius-card`, `--color-cta` focus/submit, pill submit. Make the gate use `--color-cta`/green track consistently.
- Add a compact "Add a photo" header to the form (icon + heading + helper) so it reads as a composer, not a raw `<input type=file>`.
- Masonry: keep polaroid rotation + lightbox. Add subtle reaction/comment count chips to tiles where data exists (read-only hint; full engagement still in lightbox/feed) — **without** changing the upload/delete flow.
- Skeleton tiles while loading; on-brand empty state.

---

## 7. Announcements strategy

- `SectionIntro` (role-aware copy).
- `AnnouncementCard`: tape + push-pin kept; **gold "Promoted"** badge when purchased; **"Official" treatment reserved** but documented as not-yet-backed (see §8).
- Host composer (`HostAnnouncementComposer`): keep all states (free/quota, purchase pricing, draft activation, success). Polish surfaces, pricing cards, and quota badge to match the design system. No logic change.

---

## 8. Admin / official posting strategy

- **No admin/official backend exists** (audit §3–4). The plan will **not** fabricate one.
- Real, data-backed distinction = **purchased host announcements** → surface as **"Promoted"** (gold). This is the honest premium treatment.
- Build a reusable `CommunityBadge` with an `official` variant **ready** (E&E mark + gold), but only wire it to data that actually exists (the fixture blog/E&E marketing card may use it; real posts use `promoted`). Document the official-posting gap at the top of the plan and in the audit so it's a tracked future capability, not a silent fake.
- Keep all host gating intact; never expose composer/admin UI to non-hosts.

---

## 9. Community navigation strategy

- Keep `CommunityTabNav` (Feed/Photos/Announcements) — it's already correct and accessible (`aria-current`).
- Promote it visually under the header so it reads as the primary section switch.
- Ensure the active tab is obvious on mobile; keep horizontal scroll fallback but it should rarely trigger.

---

## 10. Component strategy (build before restyling pages — Phase 3)

New shared community primitives in `apps/web/components/community/`:
- `CommunityBadge.tsx` — variants `seeker | host | official | promoted | blog`, icon + label, token-driven.
- `SectionIntro.tsx` — eyebrow icon, title, description, optional CTA; role/section aware.
- `Skeletons.tsx` — `PostSkeleton`, `PhotoSkeleton` shimmer blocks.
- `CommunityEmptyState.tsx` — icon + heading + sub + CTA.
- Shared `*.module.css` for each, referencing semantic + scoped `--community-*` tokens.

Reuse, don't duplicate: existing `seekerBadge/hostBadge` markup migrates to `CommunityBadge` where low-risk; new surfaces use it from the start.

---

## 11. Card / post strategy

- One card spine: warm surface, ink hairline, left accent stripe (green for seeker, gold for promoted/official).
- Consistent header (avatar → name + badge → time → menu).
- Consistent media: mat + frame, 16:9 in feed, 4:3 polaroid in masonry.
- Consistent engagement footer (`PostEngagement`) — unchanged logic, lightly restyled to match.

---

## 12. Forms / composer strategy

- **PhotoUploadForm:** repair tokens, add composer header, keep `name="photo|caption|location_tag"`, keep 80% gate and `uploadCommunityPhotoAction`.
- **HostAnnouncementComposer:** polish only; keep `title|body|kind` fields, all branch states, Stripe + draft flows.
- **ShareComposer (feed):** keep as a CTA to Photos.
- All inputs use `--field-*` tokens; focus ring `--color-cta`; errors `--status-error-fg` (not raw `#ef4444`).

---

## 13. Empty / loading / error strategy

- **Empty:** `CommunityEmptyState` per tab with real CTA ("Add the first photo", "Be the first to post", host → "Post your first announcement").
- **Loading:** skeletons (since `force-dynamic`, mostly covers slow data + client transitions).
- **Error:** keep `error.tsx` (Sentry) — light polish to match.

---

## 14. Permission / moderation state strategy

- Preserve every gate (audit §5). Visual changes only.
- "Report" stays cosmetic but reword to "Report to E&E" honestly (no fake "removed" claims). Keep Hide/Copy-link (these work client-side).
- Composer/upload/delete/comment-delete visibility conditions unchanged.

---

## 15. Implementation phases

| Phase | Work | Files |
|---|---|---|
| 3 | Primitives + **token fix** | new `community/{CommunityBadge,SectionIntro,Skeletons,CommunityEmptyState}.tsx` + css; `CommunityDashboard.module.css` (form/gate fix) |
| 4 | Shell/header + mobile content restore | `CommunityDashboard.tsx` + `.module.css` |
| 5 | Feed cards + promoted badge | `CommunityDashboard.tsx` (announcement mapping + card) + css |
| 6 | Photos composer + masonry + skeletons | `CommunityDashboard.tsx` + css; photos route markup |
| 7–8 | Announcements intro + composer polish | `CommunityDashboard.tsx`, `HostAnnouncementComposer.*` |
| 9 | Forms/modals/states consistency | `PostEngagement.*`, `error.tsx` |
| 10 | QA: lint, typecheck, build, responsive | — |

---

## 16. Exact files likely edited

**Edit:** `apps/web/components/seeker/CommunityDashboard.tsx`, `…/CommunityDashboard.module.css`, `apps/web/components/community/PostEngagement.tsx` + css, `apps/web/components/host/HostAnnouncementComposer.tsx` + css, `apps/web/app/(seeker)/community/{page,photos/page,announcements/page,error}.tsx`.
**New:** `apps/web/components/community/CommunityBadge.tsx`(+css), `SectionIntro.tsx`(+css), `Skeletons.tsx`(+css), `CommunityEmptyState.tsx`(+css).
**Never:** `app/actions/community.ts`, `packages/db/src/queries/community.ts`, `packages/contracts/src/community.ts`, `supabase/migrations/*`.

---

## 17. Acceptance check (maps to brief)

- Premium, mobile-first, alive feed ✓ (Phase 4–5)
- Immersive photos ✓ (Phase 6)
- Official/trusted announcements ✓ (Phase 7–8, promoted treatment; official gap documented)
- Protected, usable admin/host posting ✓ (gates untouched)
- Role-aware UI ✓ (`CommunityBadge`, composer gating)
- Polished empty/loading/error ✓ (Phase 3/9)
- Obvious Feed/Photos/Announcements nav ✓ (Phase 4/9)
- Unified with Explore&Earn ✓ (tokens, paper+sky+gold)
- Existing functionality intact ✓ (presentational-only rule)
- Build passes ✓ (Phase 10)
