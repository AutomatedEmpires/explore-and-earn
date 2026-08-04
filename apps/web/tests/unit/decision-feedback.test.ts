import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) =>
  readFileSync(new URL(relative, webRoot), "utf8");

describe("seeker decision feedback", () => {
  it("settles the swipe card before delegating a committed gesture", () => {
    const deck = read("components/seeker/SwipeDeck.tsx");
    const start = deck.indexOf("const onPointerEnd");
    const end = deck.indexOf("const onPointerCancel", start);
    const release = deck.slice(start, end);
    const clearDragging = release.indexOf("setDragging(false)");
    const clearOffset = release.indexOf("setOffset({ x: 0, y: 0 })");
    const actionGuard = release.indexOf("if (action)");
    const delegate = release.indexOf("void triggerLeave(action)");

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(clearDragging).toBeGreaterThan(-1);
    expect(clearOffset).toBeGreaterThan(clearDragging);
    expect(actionGuard).toBeGreaterThan(clearOffset);
    expect(delegate).toBeGreaterThan(actionGuard);
  });

  it("rolls Seek back and announces rejected or unreachable writes", () => {
    const seek = read("components/seeker/SeekBrowser.tsx");
    const start = seek.indexOf("const commitDecision");
    const end = seek.indexOf("const cardOverrides", start);
    const decision = seek.slice(start, end);
    const clearError = decision.indexOf("setDecisionError(null)");
    const optimistic = decision.indexOf("setCardDecision(id, decision)");
    const failureGuard = decision.indexOf(
      "!result.ok || result.decision === undefined",
    );
    const rollback = decision.indexOf(
      "result.decision === undefined ? previous : result.decision",
    );
    const feedback = decision.indexOf(
      "decisionFailureMessage(decision, result.failureReason)",
    );

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(clearError).toBeGreaterThan(-1);
    expect(optimistic).toBeGreaterThan(clearError);
    expect(failureGuard).toBeGreaterThan(optimistic);
    expect(rollback).toBeGreaterThan(failureGuard);
    expect(feedback).toBeGreaterThan(rollback);
    expect(decision).toContain("setCardDecision(id, previous)");
    expect(decision).toContain(
      'setDecisionError("We couldn’t reach the server. Try again.")',
    );
    expect(seek).toContain('<p className={styles.count} role="alert">');
  });

  it("keeps Map reconciliation versioned and exposes categorized failures", () => {
    const map = read("components/map/MapView.tsx");
    const start = map.indexOf("const queueDecision");
    const end = map.indexOf("const cardOverrides", start);
    const decision = map.slice(start, end);
    const clearError = decision.indexOf("setDecisionError(null)");
    const optimistic = decision.indexOf("setLocalDecision(id, next)");
    const versionGuard = decision.indexOf(
      "decisionVersions.current.get(id) !== version",
    );
    const rollback = decision.indexOf(
      "result.decision === undefined ? previous : result.decision",
    );
    const failureGuard = decision.indexOf(
      "!result.ok || result.decision === undefined",
    );
    const feedback = decision.indexOf(
      "decisionFailureMessage(next, result.failureReason)",
    );

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(clearError).toBeGreaterThan(-1);
    expect(optimistic).toBeGreaterThan(clearError);
    expect(versionGuard).toBeGreaterThan(optimistic);
    expect(rollback).toBeGreaterThan(versionGuard);
    expect(failureGuard).toBeGreaterThan(rollback);
    expect(feedback).toBeGreaterThan(failureGuard);
    expect(decision).toMatch(
      /catch \{[\s\S]*decisionVersions\.current\.get\(id\) === version[\s\S]*setLocalDecision\(id, previous\);[\s\S]*setDecisionError\("We couldn’t reach the server\. Try again\."\)/,
    );
    for (const reason of [
      "unauthenticated",
      "rate_limit_exceeded",
      "temporarily_unavailable",
      "conflict",
    ]) {
      expect(map).toContain(`case "${reason}"`);
    }
    expect(map).toContain('<span role="alert">{decisionError}</span>');
  });
});
