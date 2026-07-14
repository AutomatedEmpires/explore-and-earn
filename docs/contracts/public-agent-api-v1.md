# Public Agent Surfaces — v1 contracts

**Status:** shipped on `fable/intelligence-core` · **Owner:** shared core (RFC
2026-07-14) · **Consumers:** external AI agents, crawlers, future native
clients. Read-only, versioned, no key required, per-IP rate-limited.

One service layer backs every surface: `apps/web/services/publicInventory`
(validation → `packages/db` `searchListings`/public reads → v1 DTOs). Routes
and MCP tools are thin adapters — never re-implement filtering or mapping in
an adapter.

## REST API v1

Envelope: every route returns `ApiResponse<T>` from
`@explore-and-earn/contracts` (`{ ok: true, data, meta? } | { ok: false,
error: { code, message, fields? } }`). Pagination cursor rides in
`meta.nextCursor` (opaque; pass back as `cursor`).

| Route | What | Rate limit | Cache |
|---|---|---|---|
| `GET /api/public/v1/listings` | Search LIVE listings | 60/min/IP | `s-maxage=60, swr=300` |
| `GET /api/public/v1/listings/{id}` | One live listing (closed/draft = 404) | 120/min/IP | `s-maxage=300, swr=600` |
| `GET /api/public/v1/organizations/{id}` | Public host profile + live listing count | 120/min/IP | `s-maxage=300, swr=600` |

Search params: `q`, `category` (`farm|maritime|remote|seasonal|mix`),
`housing`, `meals`, `visaSupport` (booleans; `true` filters, absent/false does
not), `minPay` (whole USD dollars vs listing min pay), `place` (substring on
the location label), `startAfter`/`startBefore` (ISO dates vs `begins_at`),
`minLat`/`maxLat`/`minLng`/`maxLng` (bounding box — all four or none;
antimeridian-crossing boxes are rejected), `limit` (1–100, default 24),
`cursor`. Invalid values → `400 VALIDATION_FAILED` with per-field detail —
never coerced.

DTOs (source of truth: `packages/contracts/src/public-api.ts`):
`PublicListingSummaryV1`, `PublicListingDetailV1` (adds `description` +
`galleryPhotoUrls`), `PublicOrganizationV1`. Key rules:

- `location.precision` is honest: `point` (real coordinates), `label_only`,
  `remote`, `unspecified`. Text is never geocoded into coordinates.
- `benefits` is the HOUSING/MEALS/PAY triad; `pay.minCents/maxCents` are
  integer cents, `null` = the listing does not state pay.
- Only live listings exist on this surface; the DTO key sets are pinned by
  `apps/web/tests/unit/public-inventory.test.ts` — adding a field means
  updating that allow-list deliberately (that is the PII gate).

## MCP server v1

- Endpoint: `POST /api/public/mcp/mcp` (MCP streamable HTTP; SSE disabled).
- Server: `explore-and-earn-public` v1.0.0, built with `mcp-handler` +
  `@modelcontextprotocol/sdk@1.26.0`.
- Tools (all read-only; there are no write tools to invoke):
  - `search_listings` — same filters as the REST search; result page ≤ 20.
  - `get_listing` — accepts a listing id or `/listing/{id}` URL.
  - `get_organization` — accepts an org id or `/host/{id}` URL.
  - `explain_marketplace` — static marketplace model + agent citation rules.
- 30 tool calls/min/IP. Tool results are JSON text using the same v1 DTOs.

## Adding to v1 (rules)

1. Fields are added, never renamed/removed, within v1. Breaking shape changes
   are v2 under `/api/public/v2/*`.
2. New data must be public-by-product-design and mapped in
   `services/publicInventory` — an adapter must never query the db directly.
3. Update the pinned key-set tests and `apps/web/app/llms.txt/route.ts` (the
   agent-facing docs) in the same PR.
4. Localization: v1 stays locale-neutral (stable codes + verbatim
   user-generated content). Localized presentation is v2 territory.
