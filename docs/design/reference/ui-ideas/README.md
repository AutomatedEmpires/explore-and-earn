# UI Ideas Reference Set

Source folder on machine:
- `/mnt/c/Users/autom/projects/automated_empires/explore&earn/ui ideas`

Preserved in repo:
- `docs/design/reference/ui-ideas/`

## Saved Assets

### Popup references
- `admin profile popup.png`
- `explore&earn profile popup.png`
- `host profile popup.png`
- `seeker profile popup.png`
- `housing popup.png`
- `meals popup.png`
- `pay popup.png`
- `message host popup.png`
- `message seeker popup.png`
- `report host popup.png`
- `report listing popup.png`
- `report seeker popup.png`
- `quick peek popup card.png`

### Card references
- `seeker discovery card applied.png`
- `seeker discovery card offered.png`
- `seeker discovery card saved.png`
- `seeker discovery card schedule.png`
- `seeker applicant card.png`
- `featured seeker applicant card.png`
- `seeker photo card.png`

### Reel / rail reference
- `featured employers reel.png`

## Shared Visual System Present In The References

1. Warm parchment panel background with visible paper grain.
2. Dark hand-ink border treatment with double-outline feel.
3. Scenic illustrated hero art used inside both cards and popups.
4. Crest / medallion identity treatment rather than flat avatar chips.
5. Bold all-caps display titles for shell headers and card labels.
6. Inset framed sub-panels for facts, stats, reasons, and form groups.
7. Blue primary CTA, neutral secondary CTA, and semantically colored outline accents.
8. Repeated icon + label pattern across cards, popups, and rails.
9. Consistent close / report affordances in popup top-right actions.
10. A single family resemblance between host, seeker, and admin surfaces.

## Current Implementation Surfaces To Align

### Popup shell owner
- `apps/web/components/overlay/PopupShell.tsx`
- `apps/web/components/overlay/PopupShell.module.css`

### Canonical marketplace card owner
- `packages/ui/src/DiscoveryCard.tsx`

### Host applicant wrapper and action row
- `apps/web/components/host/HostApplicantCard.tsx`
- `apps/web/components/host/HostApplicantCardActions.tsx`

## Intended Mapping

### Discovery card family
- `seeker discovery card saved.png`: canonical seeker card baseline.
- `seeker discovery card applied.png`: applied-state CTA/state treatment.
- `seeker discovery card offered.png`: offer-state CTA/state treatment.
- `seeker discovery card schedule.png`: upcoming/scheduled CTA state.
- `seeker applicant card.png`: host-side applicant review card layout.
- `featured seeker applicant card.png`: promoted/high-match applicant variant.
- `seeker photo card.png`: image-heavy variant for profile/photo contexts.

### Popup family
- `quick peek popup card.png`: listing analytics / quick-peek shell.
- `host profile popup.png`: host identity modal shell.
- `seeker profile popup.png`: seeker identity modal shell.
- `message host popup.png`: locked/permission-aware message shell.
- `message seeker popup.png`: inverse message shell for host lane.
- `housing popup.png`: media grid + structured form shell.
- `meals popup.png`: same shell family as housing, meals-specific content.
- `pay popup.png`: benchmark / meter modal pattern.
- `report listing popup.png`: report flow shell with reason-grid layout.
- `report host popup.png`: host reporting variant.
- `report seeker popup.png`: seeker reporting variant.
- `admin profile popup.png`: admin moderation/profile inspection variant.
- `explore&earn profile popup.png`: brand/profile overview variant.

### Rail / carousel family
- `featured employers reel.png`: homepage rail / editorial featured-employer module.

## Build Discipline To Match The Vision

1. Do not fork card anatomy per page. Extend `DiscoveryCard` by surface/slot only.
2. Do not fork modal chrome per feature. Extend `PopupShell` by props/slots only.
3. Treat the parchment texture, border, corner radius, close button, and CTA language as shared tokens.
4. Move every popup into the same header/body/footer anatomy before tuning content details.
5. Use one variant matrix for states: seeker, host, applicant, saved, applied, offered, scheduled, featured.
6. Validate each implementation against its matching PNG before moving to the next surface.
