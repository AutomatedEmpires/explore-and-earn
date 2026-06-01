/**
 * Shared component state model for Design System V1.
 *
 * Every primitive should be able to express each of these states. Styling
 * hooks off the `data-state` attribute (see apps/web/styles/primitives.css)
 * and never relies on color alone to convey meaning.
 *
 * NOTE(?): the Design System V1 Build Pack prose says "11 states" but
 * enumerates the 12 values below. The enumerated list is treated as canonical
 * here; flag for founder/spec reconciliation rather than dropping one.
 */
export const COMPONENT_STATES = [
  "default",
  "hover",
  "focus",
  "active",
  "disabled",
  "locked",
  "loading",
  "empty",
  "error",
  "success",
  "warning",
  "critical",
] as const;

export type ComponentState = (typeof COMPONENT_STATES)[number];

/** Spread onto an element to drive state styling, e.g. {...dataState("loading")}. */
export function dataState(state: ComponentState): { "data-state": ComponentState } {
  return { "data-state": state };
}
