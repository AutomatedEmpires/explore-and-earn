import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { devHostOutreachFixture } from "../../lib/devBench/outreachFixtures";
import { buildAccountGroups } from "../../components/seeker/account";
import {
  filterPreviewSeekers,
  inviteErrorMessage,
  isSourceableOutreachListing,
  normalizeSeekerSearchRequest,
  searchDiscoveryErrorMessage,
} from "../../lib/hostOutreach";

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) =>
  readFileSync(new URL(relative, webRoot), "utf8");

describe("host outreach request and listing truth", () => {
  const LISTING_ID = "11111111-1111-4111-8111-111111111111";

  it("normalizes whitespace and enforces the DB's listing/query bounds", () => {
    expect(normalizeSeekerSearchRequest(LISTING_ID, "  orchard   lead ")).toEqual({
      ok: true,
      listingId: LISTING_ID,
      query: "orchard lead",
    });
    expect(normalizeSeekerSearchRequest(LISTING_ID, "a")).toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(normalizeSeekerSearchRequest("not-a-uuid", "Avery")).toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(
      normalizeSeekerSearchRequest(LISTING_ID, `${" ".repeat(101)}Avery`),
    ).toEqual({
      ok: true,
      listingId: LISTING_ID,
      query: "Avery",
    });
    expect(normalizeSeekerSearchRequest(LISTING_ID, "a".repeat(101))).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it("only treats live, verified, future, non-null expiry listings as sourceable", () => {
    const now = Date.parse("2026-08-09T12:00:00.000Z");
    const ready = {
      status: "live",
      provenance: "verified",
      expires_at: "2026-08-10T12:00:00.000Z",
    };
    expect(isSourceableOutreachListing(ready, now)).toBe(true);
    expect(isSourceableOutreachListing({ ...ready, status: "draft" }, now)).toBe(false);
    expect(isSourceableOutreachListing({ ...ready, provenance: "sourced" }, now)).toBe(false);
    expect(isSourceableOutreachListing({ ...ready, expires_at: null }, now)).toBe(false);
    expect(
      isSourceableOutreachListing(
        { ...ready, expires_at: "2026-08-09T11:59:59.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("keeps preview search listing-scoped and deterministic", () => {
    const fixture = devHostOutreachFixture();
    const orchard = fixture.searchPreview.seekersByListingId[fixture.listings[0]!.id]!;
    const vineyard = fixture.searchPreview.seekersByListingId[fixture.listings[1]!.id]!;
    expect(filterPreviewSeekers(orchard, "  Jordan ")).toHaveLength(1);
    expect(orchard.find((row) => row.displayName === "Jordan Lee")?.alreadyInvited).toBe(true);
    expect(vineyard.find((row) => row.displayName === "Jordan Lee")?.alreadyInvited).toBe(false);
    expect(filterPreviewSeekers(orchard, "a")).toEqual([]);
    expect(
      fixture.buckets.flatMap((bucket) =>
        bucket.state === "ready" ? bucket.seekers.map((seeker) => seeker.photoUrl) : [],
      ),
    ).toEqual([null, null]);
  });

  it("maps every stable backend result to safe copy instead of raw codes", () => {
    for (const error of [
      "unauthenticated",
      "rate_limit_exceeded",
      "invalid_request",
      "listing_unavailable",
      "temporarily_unavailable",
    ] as const) {
      expect(searchDiscoveryErrorMessage(error)).not.toContain(error);
    }
    for (const error of [
      "invalid_request",
      "host_not_eligible",
      "listing_not_actionable",
      "seeker_not_sourceable",
      "already_applied",
      "already_invited",
      "invite_credits_required",
      "invite_authority_unavailable",
      "temporarily_unavailable",
    ]) {
      expect(inviteErrorMessage(error)).not.toContain(error);
    }
    expect(inviteErrorMessage("invite_credits_required")).not.toMatch(/next month/i);
    expect(inviteErrorMessage("invite_credits_required")).toContain(
      "pack or plan options",
    );
  });

  it("does not represent host discovery as a static always-on account row", () => {
    const privacy = buildAccountGroups(null).find((group) => group.id === "privacy");
    expect(privacy?.rows.find((row) => row.id === "visibility")).toBeUndefined();
  });
});

describe("host outreach route and component seams", () => {
  const page = read("app/[locale]/(host)/host/outreach/page.tsx");
  const action = read("app/actions/invites.ts");
  const sourcingAction = read("app/actions/hostSourcing.ts");
  const drawer = read("components/host/SeekerSearchDrawer.tsx");
  const drawerCss = read("components/host/SeekerSearchDrawer.module.css");
  const popupCss = read("components/overlay/PopupShell.module.css");
  const popup = read("components/overlay/PopupShell.tsx");
  const matched = read("components/host/MatchedSeekerSourcing.tsx");
  const buyMore = read("components/host/BuyMoreInvitesPopup.tsx");
  const matchedCss = read("components/host/MatchedSeekerSourcing.module.css");
  const sourcedCard = read("components/host/SourcedSeekerCard.tsx");
  const sourcedCardCss = read("components/host/SourcedSeekerCard.module.css");
  const invitesList = read("app/[locale]/(host)/host/outreach/InvitesList.tsx");
  const pageCss = read("app/[locale]/(host)/host/outreach/page.module.css");
  const catalog = read("components/dev/catalog/CatalogClient.tsx");
  const visibilitySetting = read(
    "components/seeker/HostDiscoveryVisibilitySetting.tsx",
  );
  const settingsPage = read("app/[locale]/(seeker)/settings/page.tsx");

  it("loads the exact-role dev fixture before auth and conceals it cross-role", () => {
    const roleRead = page.indexOf("await readDevRole()");
    const fixtureRead = page.indexOf("devHostOutreachFixture()");
    const authRead = page.indexOf("await auth()");
    expect(roleRead).toBeGreaterThan(-1);
    expect(fixtureRead).toBeGreaterThan(roleRead);
    expect(authRead).toBeGreaterThan(fixtureRead);
    expect(page).toContain('if (devRole === "host")');
    expect(page).toContain("else if (devRole !== null)");
    expect(page).toContain('data-dev-fixture={isDevFixture ? "host-outreach"');
  });

  it("does not collapse authenticated page reads into empty or unavailable-looking nulls", () => {
    expect(page).not.toMatch(/getHostInvites\([^)]*\)\.catch/s);
    expect(page).not.toMatch(/getHostListings\([^)]*\)\.catch/s);
    expect(page).not.toMatch(/getInviteEntitlement\([^)]*\)\.catch/s);
    expect(page).not.toMatch(/getMatchedSeekersForListing\([^;]*\.catch/s);
    expect(page).toContain("result.ok");
    expect(page).toContain('state: "unavailable" as const');
  });

  it("names the match region and states the account privacy boundary", () => {
    expect(page).toContain('id="host-outreach-matches-heading"');
    expect(matched).toContain('aria-labelledby="host-outreach-matches-heading"');
    expect(page).toContain("Opted-in seekers share their display name, bio");
    expect(page).toContain("Structured account");
    expect(page).toContain("exact availability, pay preferences, and résumés");
    expect(page).toContain("photoUrl: null");
    expect(page).toContain("real aggregate match score");
    expect(sourcedCard).not.toContain("backgroundImage");
    expect(sourcedCard).not.toContain("seeker.photoUrl ?");
    expect(sourcedCard).not.toContain("matchReasonPhrase");
    expect(sourcedCard).not.toContain("seeker.components");
    expect(sourcedCardCss).toMatch(
      /\.skill\s*{[^}]*max-width:\s*100%;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s,
    );
    expect(
      devHostOutreachFixture().buckets
        .flatMap((bucket) => (bucket.state === "ready" ? bucket.seekers : []))
        .flatMap((seeker) => seeker.generalSkills)
        .some((skill) => !skill.includes(" ") && skill.length > 44),
    ).toBe(true);
  });

  it("keeps cross-user discovery behind an explicit off-by-default seeker control", () => {
    expect(settingsPage).toContain("getHostDiscoverySettingAction()");
    expect(settingsPage).toContain("<HostDiscoveryVisibilitySetting");
    expect(visibilitySetting).toContain("Off by default.");
    expect(visibilitySetting).toContain("Host discovery permission");
    expect(visibilitySetting).toContain("Permission on");
    expect(visibilitySetting).toContain("saves your permission");
    expect(visibilitySetting).toContain(
      "only while it is complete, platform-visible, and otherwise eligible",
    );
    expect(visibilitySetting).not.toContain("can now find this profile");
    expect(visibilitySetting).toContain("useState<boolean | null>");
    expect(visibilitySetting).toContain("initial.ok ? initial.enabled : null");
    expect(visibilitySetting).toContain("enabled !== null ? (");
    expect(visibilitySetting).not.toContain("initial.ok ? initial.enabled : false");
    expect(visibilitySetting).toContain('role="switch"');
    expect(visibilitySetting).toContain("aria-checked={enabled}");
    expect(visibilitySetting).toContain("await updateHostDiscoverySettingAction(next)");
    expect(visibilitySetting.indexOf("setEnabled(result.enabled)")).toBeGreaterThan(
      visibilitySetting.indexOf("if (!result.ok)"),
    );
    expect(visibilitySetting).toContain('role="alert"');
  });

  it("keeps preview controls local and distinguishes empty from failed", () => {
    expect(drawer).toContain("if (preview)");
    expect(drawer).toContain("preview.seekersByListingId[listingId]");
    expect(drawer).toContain("No seekers matched");
    expect(drawer).toContain('role="alert"');
    expect(drawer).toContain('role="status"');
    expect(drawer).toContain('role="note"');
    expect(matched).toContain("No sourceable matches for this listing yet.");
    expect(matched).toContain('`${bucket.seekers.length} shown`');
    expect(matched).not.toContain('`${bucket.seekers.length} matched`');
    expect(matched).toContain("Matched seekers are temporarily unavailable");
    expect(matched).toMatch(/preview\s*\?\s*"Preview invite"/);
    expect(matched).toContain("!preview ? (");
    expect(catalog).toContain("CATALOG_INVITE_PREVIEW");
    expect(catalog).toContain("preview={CATALOG_INVITE_PREVIEW}");
  });

  it("invalidates stale searches, distinguishes previews from invites, and pins touch size", () => {
    expect(drawer).toContain("const requestEpoch = ++searchEpoch.current");
    expect(drawer).toContain("requestEpoch !== searchEpoch.current");
    expect(drawer).toContain("searchEpoch.current += 1");
    expect(drawer).toContain("function handleQueryChange(nextQuery: string)");
    expect(drawer).toContain("onChange={(event) => handleQueryChange(event.target.value)}");
    expect(drawer).toMatch(
      /handleQueryChange[\s\S]*?searchEpoch\.current \+= 1;[\s\S]*?setResults\(\[\]\)/,
    );
    expect(drawer).toContain("ReadonlySet<string>");
    expect(drawer).toContain("invitedIds.has(seeker.seekerProfileId)");
    expect(drawer).toContain("previewedIds.has(seeker.seekerProfileId)");
    const handleSendStart = drawer.indexOf("async function handleSend()");
    const liveSendStart = drawer.indexOf(
      "const result = await sendInviteAction",
      handleSendStart,
    );
    expect(handleSendStart).toBeGreaterThan(-1);
    expect(liveSendStart).toBeGreaterThan(handleSendStart);
    const previewSendBranch = drawer.slice(handleSendStart, liveSendStart);
    expect(previewSendBranch).toContain("setPreviewedIds");
    expect(previewSendBranch).toContain("setSentStatus(OUTREACH_PREVIEW_STATUS)");
    expect(previewSendBranch).not.toContain("setInvitedIds");
    expect(drawer).toMatch(
      /result\.error === "already_invited"[\s\S]*?setInvitedIds[\s\S]*?setSelected\(null\)/,
    );
    expect(drawer).toContain('isPreviewed ? "Previewed locally" : "Already invited"');
    expect(drawer).toContain("function clearSelectedSeeker()");
    expect(drawer).toMatch(
      /clearSelectedSeeker\(\)[\s\S]*?setSelected\(null\);[\s\S]*?setMessage\(""\)/,
    );
    expect(drawer).toMatch(
      /handleQueryChange\(nextQuery: string\)[\s\S]*?if \(sendInFlight\.current\) return/,
    );
    expect(drawer).toContain(
      "disabled={isSending || isAlreadyInvited || isPreviewed}",
    );
    expect(drawer).toContain("disabled={isSending}");
    expect(drawer).toContain("aria-describedby={seeker.bio ? descriptionId : undefined}");
    expect(drawer).toContain("messageRef.current?.focus()");
    expect(drawer).toContain("sentStatusRef.current?.focus()");
    expect(drawer).toContain("resultRefs.current.get(restoreId)?.focus()");
    expect(drawer).toContain("tabIndex={-1}");
    expect(popup).toContain("(focusables()[0] ?? panel).focus()");
    expect(popup).toMatch(
      /if \(items\.length === 0\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?panel\.focus\(\)/,
    );
    expect(popup).toContain("if (!items.includes(active as HTMLElement))");
    expect(matched).toContain("disabled={isAnySending}");
    expect(invitesList).toContain("disabled={withdrawingId !== null}");
    expect(page).toContain("<InvitesList");
    expect(read("app/[locale]/(host)/host/outreach/InvitesList.tsx")).toContain(
      "key={selectedListing.id}",
    );
    expect(drawerCss).toMatch(
      /\.clearSelected\s*{[^}]*width:\s*var\(--tap-min\);[^}]*height:\s*var\(--tap-min\);/s,
    );
    expect(drawerCss).toMatch(/\.resultName\s*{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(drawerCss).toMatch(/\.empty\s*{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(drawerCss).toMatch(
      /\.selectedInfo\s*>\s*span\s*{[^}]*overflow-wrap:\s*anywhere;/s,
    );
    expect(pageCss).toMatch(/\.funnelTitle\s*{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(popupCss).toMatch(/\.meta\s*{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(matchedCss).toMatch(/\.bucketSub\s*{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(
      devHostOutreachFixture().listings.some(
        (listing) => !listing.title.includes(" ") && listing.title.length > 60,
      ),
    ).toBe(true);
    expect(
      Object.values(
        devHostOutreachFixture().searchPreview.seekersByListingId,
      )
        .flat()
        .some(
          (seeker) =>
            Boolean(seeker.displayName) &&
            !seeker.displayName!.includes(" ") &&
            seeker.displayName!.length > 60,
        ),
    ).toBe(true);
    expect(
      devHostOutreachFixture().buckets.some(
        (bucket) =>
          Boolean(bucket.locationDisplay) &&
          !bucket.locationDisplay!.includes(" ") &&
          bucket.locationDisplay!.length > 60,
      ),
    ).toBe(true);
  });

  it("keeps filtered-listing, invite-balance, funnel, and date copy truthful", () => {
    expect(page).toContain("hasAnyListings={hasAnyListings}");
    expect(invitesList).toContain("No current listings are ready for new invites.");
    expect(page).toContain("available invite balance");
    expect(page).toContain("monthly allowance first, then purchased invite credits");
    expect(page).toContain("pct(entry.delivered, entry.sent)");
    expect(page).not.toContain("OPENED_STATUSES");
    expect(page).not.toContain("opened ·");
    expect(page).toContain('style={{ width: `${reach}%` }}');
    expect(page).not.toContain("Math.max(reach, 4)");
    expect(invitesList).toContain('timeZone: "UTC"');
    expect(invitesList).not.toContain("toLocaleDateString");
    expect(invitesList).not.toContain("toLocaleString");
    expect(invitesList).toContain("?? listings[0]");
    expect(invitesList).toContain('disabled={!selectedListing}');
    expect(invitesList).toContain('value={selectedListing?.id ?? ""}');
    expect(invitesList).not.toContain('{ key: "viewed", label: "Viewed" }');
    expect(invitesList).toContain('if (status === "viewed") return 1');
    expect(invitesList).toContain('ignored: "Declined"');
    expect(invitesList).toContain("withdrawStatusRef.current?.focus()");
    expect(invitesList).toContain(
      "Its original invite-credit charge was reversed.",
    );
    expect(invitesList).toContain('role="status"');
    expect(action).toMatch(
      /type WithdrawInviteActionResult[\s\S]*?Extract<WithdrawInviteResult,[\s\S]*?export async function withdrawInviteAction[\s\S]*?Promise<WithdrawInviteActionResult>/,
    );
    expect(matched).toContain("const hasMonthlyAllowance =");
    expect(matched).toContain("This account has no invite credits.");
    expect(matched).toContain("wait for your next included monthly allowance.");
    expect(matched).toContain("choose a plan with a monthly allowance.");
    expect(matched).not.toContain("wait for next month&apos;s allowance");
    expect(buyMore).toContain("if (pending) return;");
    expect(buyMore).toContain("closeDisabled={pending}");
    expect(buyMore).toMatch(
      /startPurchase\(async \(\) => \{[\s\S]*?try \{[\s\S]*?await purchaseInviteCreditsAction[\s\S]*?\} catch \{[\s\S]*?\} finally \{[\s\S]*?setSelected\(null\)/,
    );
    expect(buyMore).toContain("No purchase was completed and no charge was made.");
    expect(buyMore).not.toContain("Your monthly allowance still works today.");
    expect(matched).toMatch(
      /aria-valuemax=\{Math\.max\([\s\S]*?entitlement\.monthlyAllowance,[\s\S]*?entitlement\.monthlyUsed,[\s\S]*?1,/,
    );
    expect(matched).toMatch(
      /result\.error === "invite_credits_required"[\s\S]*?setRemaining\(0\);[\s\S]*?router\.refresh\(\)/,
    );
    expect(drawer).toMatch(
      /result\.error === "invite_credits_required"[\s\S]*?router\.refresh\(\)/,
    );
  });

  it("validates both discovery actions before auth and never catches search to empty", () => {
    expect(action.indexOf("normalizeSeekerSearchRequest(")).toBeLessThan(
      action.indexOf("const { userId, getToken } = await auth()", action.indexOf("searchSeekersAction")),
    );
    expect(action).not.toContain("searchSeekersForInvite(token, userId, query).catch");
    const matchedAction = sourcingAction.indexOf("export async function getMatchedSeekersAction");
    expect(sourcingAction.indexOf("isValidOutreachListingId", matchedAction)).toBeLessThan(
      sourcingAction.indexOf("await auth()", matchedAction),
    );
    expect(sourcingAction).toContain('error: "temporarily_unavailable"');
  });
});
