# Discovery Card V1 — Design Spec

> The Discovery Card is the **core product primitive**. Source of truth: Notion *Canonical Card System Specification*. Product-level rules: [`../product/discovery-card-v1.md`](../product/discovery-card-v1.md). Build the visual shell from this file; do not invent layout.

## Where it appears

Homepage · discovery feed · swipe mode · map mode (popup + drawer) · saved · applied · featured · matched · host applicant review · community surfaces. **One component, many variants** — vary by scope/status/badges/actions/surface/screen size, never fork the component.

## The non-negotiable triad

Every card answers, as first-class fields with icon + label + value:

- **HOUSING** — Where will I sleep? (`benefit.housing`, Housing accent)
- **MEALS** — What will I eat? (`benefit.meals`, Meals accent)
- **PAY** — What will I earn? (`benefit.pay`, Pay accent)

**Never** collapse the triad into a generic "Perks" label.

## Required elements

| Zone | Element | Notes |
| --- | --- | --- |
| Media | full-bleed scenic/lifestyle photo | `3:2`, framed (see `photo-language.md`) |
| Identity | host avatar | tap → host profile |
| Badge | **Verified Host badge (mandatory)** | self-declared qualifier (G22) |
| Badge | seasonal / featured / category badges | badge stack, top of card |
| Title | host name + job title | Patrick Hand card title |
| Metadata | location | tap → map view |
| Metadata | begins / ends dates | Inter metadata |
| Triad | housing / meals / pay | three benefit chips |
| Action | **Quick Apply** | primary action; tap → apply/login flow |

## Optional elements (by surface)

Match score/meter (matched) · boosted treatment (boosted) · role-fill indicator (host dashboard) · application status (seeker dashboard) · listing/moderation status (host/admin) · quick-peek analytics (host dashboard).

## Interactions (locked)

| Tap target | Result |
| --- | --- |
| Location | open map view |
| Housing chip | housing details / photo bucket |
| Meals chip | meals details / photo bucket |
| Host avatar/name | host profile |
| Card body | listing detail |
| Quick Apply | apply / login flow |
| Overflow / flag | report controls |

Keep action buttons clearly separated from the card-body tap target so taps are unambiguous.

## Visual direction

Hybrid sketchbook/product UI · soft hand-drawn card edges (ink border, radius `24`, **no shadow**) · premium scenic photo area · paper-like surface · warm organic photography · purposeful hand-drawn icons · clean information blocks · high trust · fast scanning.

## Key variants

- **Seek** — primary scroll card; apply/save.
- **Swipe** — fuller visual card; right=save, left=skip, apply, report.
- **Map popup** — compact; decide to open/save/apply.
- **Map drawer** — long/skinny; thumbnail + title + location + pay + housing/meals + match/boost.
- **Community feed** — compact; must not dominate community content.
- **Matched** — adds match meter + explanation trigger.
- **Boosted** — subtle premium treatment; **never** spammy/ad-like.
- **Host dashboard** — adds status, role fill, applicant count, boost CTA, quick-peek analytics, edit/pause/close.
- **Admin review** — adds report count, trust signal, moderation status, quick actions.

## Responsive

- **Mobile:** large tap targets, vertical hierarchy, bottom action row, media-forward, bottom-sheet escalation.
- **Desktop (≥ 1024):** denser metadata, hover quick actions, side-by-side layouts, quick peek.

## States

default · hover/focus · active/pressed · selected · disabled · locked · boosted · matched · reported · under-review · expired · closed · filled · not-selected · accepted.

## Accessibility

Never rely on color alone for status — use text + icon + badge. Visible focus states. Readable touch targets. ARIA labels at implementation.

## Analytics events (emit)

`card_impression` · `card_opened` · `card_action_clicked` · `save_clicked` · `apply_clicked` · `report_clicked` · `match_score_clicked` · `housing_clicked` · `meals_clicked` · `boost_clicked`.

## Implementation target

`packages/ui` exposes `<DiscoveryCard />` composed from primitives (MediaFrame, BadgeStack, BenefitChip, Avatar, ActionRow). Feature surfaces pass data + variant props; they never re-implement the layout.
