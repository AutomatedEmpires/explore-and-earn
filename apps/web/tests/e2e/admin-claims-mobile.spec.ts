import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const PHONE_WIDTHS = [320, 375, 390] as const;

const PENDING_ID = "lst_sourced_kelp_farm";
const PENDING_TITLE = "Kelp Farm Field Technician";
const PENDING_EMAIL =
  "claims-review-operations@kodiak-kelp-field-technician.example";
const DECIDED_ID = "lst_deckhand_sitka";
const DECIDED_TITLE = "Deckhand — Salmon Season";
const DECIDED_EMAIL =
  "converted-claims-review@north-pacific-fisheries-cooperative.example";

async function expectNoDocumentOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
}

async function expectContained(
  locator: Locator,
  container: Locator,
  label: string,
) {
  const [geometry, containerGeometry] = await Promise.all([
    locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
      };
    }),
    container.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }),
  ]);

  expect(
    geometry.scrollWidth,
    `${label} has internal horizontal overflow`,
  ).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.left, `${label} starts outside its container`).toBeGreaterThanOrEqual(
    containerGeometry.left - 1,
  );
  expect(geometry.right, `${label} ends outside its container`).toBeLessThanOrEqual(
    containerGeometry.right + 1,
  );
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no rendered box`).not.toBeNull();
  expect(box!.width, `${label} is narrower than 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} is shorter than 44px`).toBeGreaterThanOrEqual(44);
}

async function expectTextWraps(
  locator: Locator,
  text: string,
  container: Locator,
  label: string,
) {
  const [textGeometry, containerBox] = await Promise.all([
    locator.evaluate((element, expectedText) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let textNode: Text | null = null;
      let offset = -1;

      while (walker.nextNode()) {
        const candidate = walker.currentNode as Text;
        const candidateOffset = candidate.data.indexOf(expectedText);
        if (candidateOffset !== -1) {
          textNode = candidate;
          offset = candidateOffset;
          break;
        }
      }

      if (!textNode || offset < 0) return null;

      const range = document.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + expectedText.length);
      const rects = Array.from(range.getClientRects()).map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
      }));

      return {
        lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
        rects,
      };
    }, text),
    container.boundingBox(),
  ]);

  expect(textGeometry, `${label} text node was not found`).not.toBeNull();
  expect(containerBox, `${label} container has no rendered box`).not.toBeNull();
  expect(textGeometry!.lines, `${label} did not wrap`).toBeGreaterThan(1);

  for (const rect of textGeometry!.rects) {
    expect(rect.left, `${label} starts outside its container`).toBeGreaterThanOrEqual(
      containerBox!.x - 1,
    );
    expect(rect.right, `${label} ends outside its container`).toBeLessThanOrEqual(
      containerBox!.x + containerBox!.width + 1,
    );
  }
}

test.describe("admin claims mobile layout", () => {
  test("contains long claims and both confirmation steps on phones", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "admin", url: BASE },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
    });

    const mutationRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.headers()["next-action"]
      ) {
        mutationRequests.push(request.url());
      }
    });

    for (const width of PHONE_WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto("/admin/claims");
      expect(response?.ok()).toBeTruthy();
      await expect(
        page.getByRole("heading", { name: "Listing claims", exact: true }),
      ).toBeVisible();

      const pendingCard = page.getByRole("listitem").filter({
        has: page.getByRole("link", { name: PENDING_TITLE, exact: true }),
      });
      const pendingGrid = pendingCard.locator("xpath=..");
      const pendingTitle = pendingCard.getByRole("link", {
        name: PENDING_TITLE,
        exact: true,
      });
      const note = pendingCard.getByRole("textbox", {
        name: "Review note (optional)",
        exact: true,
      });
      const reject = pendingCard.getByRole("button", {
        name: `Reject: claim on ${PENDING_TITLE}`,
        exact: true,
      });
      const approve = pendingCard.getByRole("button", {
        name: `Approve the claim on ${PENDING_TITLE}`,
        exact: true,
      });

      await expect(pendingCard).toBeVisible();
      await expect(pendingTitle).toHaveAttribute(
        "href",
        `/listing/${PENDING_ID}`,
      );
      await expect(
        pendingCard.getByText("Requires Review", { exact: true }),
      ).toBeVisible();
      await expect(
        pendingCard.getByText(PENDING_EMAIL, { exact: true }),
      ).toBeVisible();
      await expectContained(pendingGrid, page.locator("body"), "pending grid");
      await expectContained(pendingCard, pendingGrid, "pending claim card");
      await expectContained(note, pendingCard, "review note textarea");
      await expectContained(
        pendingTitle,
        pendingCard,
        "pending listing title",
      );
      await expectTouchTarget(note, "review note textarea");
      await expectTouchTarget(reject, "reject claim trigger");
      await expectTouchTarget(approve, "approve claim trigger");

      const decidedSection = page.getByRole("region", {
        name: "Recently decided claims",
        exact: true,
      });
      const decidedRow = decidedSection.getByRole("listitem").filter({
        has: page.getByRole("link", {
          name: DECIDED_TITLE,
          exact: true,
        }),
      });
      const decidedMeta = decidedRow.getByText(DECIDED_EMAIL, { exact: false });

      await expect(decidedRow).toBeVisible();
      await expect(
        decidedRow.getByRole("link", {
          name: DECIDED_TITLE,
          exact: true,
        }),
      ).toHaveAttribute("href", `/listing/${DECIDED_ID}`);
      await expect(
        decidedRow.getByText("Converted", { exact: true }),
      ).toBeVisible();
      await expectContained(decidedRow, decidedSection, "decided claim row");
      await expectTextWraps(
        decidedMeta,
        DECIDED_EMAIL,
        decidedRow,
        "decided claimant email",
      );

      await reject.click();
      const rejectGroup = pendingCard.getByRole("group", {
        name: `Confirm: Reject — claim on ${PENDING_TITLE}`,
        exact: true,
      });
      const rejectCancel = rejectGroup.getByRole("button", {
        name: "Cancel",
        exact: true,
      });
      const rejectConfirm = rejectGroup.getByRole("button", {
        name: `Confirm rejection: claim on ${PENDING_TITLE}`,
        exact: true,
      });

      await expect(rejectGroup).toBeVisible();
      await expectContained(rejectGroup, pendingCard, "reject confirmation");
      await expectTouchTarget(rejectCancel, "reject confirmation cancel");
      await expectTouchTarget(rejectConfirm, "reject confirmation action");
      await rejectCancel.click();
      await expect(rejectGroup).toHaveCount(0);

      await approve.click();
      const approveGroup = pendingCard.getByRole("group", {
        name: "Confirm approval",
        exact: true,
      });
      const approveCancel = approveGroup.getByRole("button", {
        name: "Cancel",
        exact: true,
      });
      const approveConfirm = approveGroup.getByRole("button", {
        name: `Confirm approval of the claim on ${PENDING_TITLE}`,
        exact: true,
      });

      await expect(approveGroup).toBeVisible();
      await expectContained(approveGroup, pendingCard, "approve confirmation");
      await expectTouchTarget(approveCancel, "approve confirmation cancel");
      await expectTouchTarget(approveConfirm, "approve confirmation action");
      await approveCancel.click();
      await expect(approveGroup).toHaveCount(0);

      await expectNoDocumentOverflow(page);
    }

    expect(mutationRequests, "confirmation layout checks must not submit").toEqual(
      [],
    );
  });
});
