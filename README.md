# Explore&Earn

Explore&Earn connects seekers with **Maritime, Seasonal, Farm, and Remote** work through three equal discovery modes: **Seek, Swipe, and Map**. Mobile seekers have pinned bottom navigation in this order: **Seek / Swipe / Map / Profile**.

This fresh repository currently contains the V1 product architecture and implementation plan only. It does not contain an application, migrations, deployed services, or production configuration.

## V1 specification

Read [Product and scope](docs/v1/00-product-and-scope.md) first, then the domain and interaction contracts. Requirements use **MUST** for acceptance conditions and **SHOULD** for recommendations. Proposed business choices and launch gates are identified explicitly.

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
| [09 · GitHub issue index](docs/v1/09-github-issues.md) | Links to 25 actual implementation issues across six phases |

## Working agreement

Do not copy the old `explore-and-earn` application into this repository. Implement the scoped issues incrementally, keeping one listing model and one card system across all three discovery modes. Resolve the documented launch gates before accepting live users or payments. The linked GitHub issues are an implementation backlog; their creation does not mean features are implemented.
