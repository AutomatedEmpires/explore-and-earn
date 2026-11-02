# Explore&Earn

Explore&Earn connects seekers with **Maritime, Seasonal, Farm, and Remote** work through three equal discovery modes: **Seek, Swipe, and Map**. Mobile seekers have pinned bottom navigation in this order: **Seek / Swipe / Map / Profile**.

This fresh repository currently contains the V1 product architecture and implementation plan only. It does not contain an application, migrations, deployed services, or production configuration.

## V1 specification

Read [Product and scope](docs/v1/00-product-and-scope.md) first, then the domain and interaction contracts. This is a living specification, not evidence of implemented features. **Confirmed** means an explicit current user choice; **Recommended** means a proposed design/default; **Open** means unresolved; **Inherited** means an earlier assistant architecture proposal retained for review. MUST/SHOULD describe strength within a contract, not who approved it. The [decision register](docs/v1/08-sources-and-decisions.md) governs status and overrides older assistant assumptions.

| Document | Purpose |
| --- | --- |
| [00 · Product and scope](docs/v1/00-product-and-scope.md) | Product rules, scope, navigation, architecture, success measures |
| [01 · Domain model](docs/v1/01-domain-model.md) | Canonical listing, housing/meals, category modules, entities and invariants |
| [02 · Discovery and cards](docs/v1/02-discovery-and-cards.md) | Wireframe interpretation, Seek/Swipe/Map behavior, search and matching |
| [03 · Profiles and host workspace](docs/v1/03-profiles-and-host-workspace.md) | Host storefront, seeker profile/resumes, dashboard and page inventory |
| [04 · Workflows and API](docs/v1/04-workflows-and-api.md) | State machines, endpoints, transactions, notifications and failures |
| [05 · Security, permissions and admin](docs/v1/05-security-permissions-admin.md) | Access matrix, privacy, uploads, moderation and operations |
| [06 · Pricing and entitlements](docs/v1/06-pricing-and-entitlements.md) | Proposed prices, enforceable limits and billing lifecycle |
| [07 · Delivery plan](docs/v1/07-delivery-plan.md) | Phased, GitHub-ready issues with dependencies and acceptance criteria |
| [08 · Sources and decisions](docs/v1/08-sources-and-decisions.md) | Conversation/wireframe provenance, resolved choices and launch gates |
| [09 · GitHub issue index](docs/v1/09-github-issues.md) | Historical issue links and reconciliation policy after repository rename |
| [10 · Screen inventory and sitemap](docs/v1/10-screen-inventory.md) | Every planned route, sheet and desktop/mobile screen contract |
| [11 · Resume, availability and privacy](docs/v1/11-resume-availability-privacy.md) | Native profile, reviewed import, templates, skills, affiliations and credential verification |
| [12 · Community and campaigns](docs/v1/12-community-and-campaigns.md) | Three-tab community, deduplication, photos, moderation and paid inventory |
| [13 · Journeys and acceptance](docs/v1/13-journeys-and-acceptance.md) | Full lifecycle, extension API contracts, release scenarios and brainstorming priorities |

## Working agreement

The active repository is `AutomatedEmpires/explore-and-earn`; `AutomatedEmpires/explore-earn` is the archived predecessor. Do not copy the archived application into this repository or change that repository as part of this work. Implement the scoped issues incrementally, keeping one listing model and one card system across all three discovery modes. Resolve the documented launch gates before accepting live users or payments. The linked GitHub issues are an implementation backlog; their creation does not mean features are implemented.
