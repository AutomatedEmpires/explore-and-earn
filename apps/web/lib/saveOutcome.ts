import type { SaveFailureReason, SaveResult } from "../app/actions/savedListings";

/**
 * What the Save control is allowed to do after a save/unsave attempt.
 *
 * This exists as its own module — rather than as a branch inside the click
 * handler — because it encodes a truth rule, and truth rules that live inside
 * private handlers get quietly reverted. The original defect was exactly that:
 * the handler flipped the label to "Saved" without ever reading the result, so
 * a rate-limited or signed-out seeker was told their listing was saved when
 * nothing had been written. Keeping the decision here means the invariant
 * ("the label moves only on a confirmed write") is a thing a test can hold.
 */
export type SaveOutcome =
  | { readonly kind: "committed"; readonly saved: boolean }
  | { readonly kind: "error"; readonly reason: SaveFailureReason };

/**
 * @param nextSaved  the state the user is trying to reach (true = saving)
 * @param result     the action's result, or null if the action threw
 */
export function resolveSaveOutcome(
  nextSaved: boolean,
  result: SaveResult | null,
): SaveOutcome {
  if (result?.ok) return { kind: "committed", saved: nextSaved };
  // A thrown action and an unexplained `{ ok: false }` are the same thing to
  // the seeker: we do not know that it worked, so we must not claim it did.
  return { kind: "error", reason: result?.error ?? "failed" };
}
