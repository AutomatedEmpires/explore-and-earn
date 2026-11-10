# Explore&Earn specs

This folder holds the approved V1 product design spec and one technical design spec per sub-project. The product spec is the source of truth. Each sub-project spec builds on Foundation and uses its exact names. Sub-projects are built in the order of product spec section 25. Each one gets its own spec, plan and build cycle.

Since 10 November 2026, SP3–SP8 may overlap SP2 where the lead judges it reasonable. Each plan's Phases section records that founder approval, from [explore-and-earn#45](https://github.com/AutomatedEmpires/explore-and-earn/issues/45). The order above is still the default, and public launch still needs every sub-project.

Implementation plans live in [`../plans`](../plans). Foundation and all sub-projects, 2 through 8, have plans. The SP3 plan carries a dated addendum for FD-8, Browse by State, which the SP3 spec predates.

| Build order | Spec | Scope | Status |
|---|---|---|---|
| (source of truth) | [Explore&Earn product design spec (V1 public launch)](2026-11-03-explore-earn-product-design.md) | The whole V1 product: categories, discovery, listings, host pages, seeker profiles, hiring, community, pricing, trust and safety, the operator console, brand, platform and the delivery plan. | Approved product spec |
| 1 | [Sub-project 1: Foundation technical design](2026-11-03-foundation-design.md) | The locked design system, app shells, Clerk identity and orgs, core schema, the API skeleton, upload scanning, moderation, audit, outbox and jobs, notifications, the operator console skeleton and CI/CD across three environments. | Foundation: building |
| 2 | [Sub-project 2: Host supply and billing technical design](2026-11-03-sp2-host-supply-billing-design.md) | Teams and roles, the host page, the listing builder, the publishing lifecycle and slots, Stripe plans, coupons and founding-host codes, and business verification. | Sub-project 2: designed, plan written ([plan](../plans/2026-11-03-sp2-host-supply-billing.md)) |
| 3 | [Sub-project 3: Discovery technical design](2026-11-03-sp3-discovery-design.md) | Seek, Swipe and Map, search, filters and sort, listing detail, saved searches and alerts, landing pages and SEO, guest browsing and the PWA install path. | Sub-project 3: designed, plan written ([plan](../plans/2026-11-03-sp3-discovery.md)) |
| 4 | [Sub-project 4: Seeker technical design](2026-11-03-sp4-seeker-design.md) | The seeker profile and resume, AI import, visibility, immutable applications and tracking, and the shared safety module (reports, blocks, mutes). | Sub-project 4: designed, plan written ([plan](../plans/2026-11-03-sp4-seeker.md)) |
| 5 | [Sub-project 5: Host hiring technical design](2026-11-03-sp5-host-hiring-design.md) | The pipeline, fit score, candidate pools and invites, interviews, offers, messaging, "As described" and host analytics, from invite to hire. | Sub-project 5: designed, plan written ([plan](../plans/2026-11-03-sp5-host-hiring.md)) |
| 6 | [Sub-project 6: Paid add-ons technical design](2026-11-03-sp6-paid-add-ons-design.md) | Boosts and their placement caps, announcement packs, extra invite packs and seats: purchase, fulfillment, labels and reporting. | Sub-project 6: designed, plan written ([plan](../plans/2026-11-03-sp6-paid-add-ons.md)) |
| 7 | [Sub-project 7: Community technical design](2026-11-03-sp7-community-design.md) | Moderated seeker photos, AI alt text, reactions, announcements and the Feed mix, with paid items capped at 1 in 5. | Sub-project 7: designed, plan written ([plan](../plans/2026-11-03-sp7-community.md)) |
| 8 | [Sub-project 8: Trust, privacy and launch readiness technical design](2026-11-03-sp8-trust-privacy-launch-design.md) | The full operator console, privacy export and erasure, the cookie banner, legal documents, accessibility and performance audits, the restore drill, the DNS cutover and the launch gates. | Sub-project 8: designed, plan written ([plan](../plans/2026-11-03-sp8-trust-privacy-launch.md)) |

## Reading order

1. The product spec, sections 1 and 25, for intent and the delivery plan.
2. The Foundation spec and its [plan](../plans/2026-11-03-foundation.md). Every later spec depends on their names.
3. The sub-project specs in build order. Each one opens with a goal and a done-when table of exit criteria, and each criterion is a test.

Where the product spec is silent, a sub-project spec marks its choice **Engineering decision**.
