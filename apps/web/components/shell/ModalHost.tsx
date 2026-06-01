import type { ReactNode } from "react";

// ModalHost — global overlay router outlet PLACEHOLDER.
// Source of truth: docs/ux/modal-sheet-system.md (Notion: Popup Architecture & Modal Families).
// SCOPE: non-functional. No overlay state machine, no portals, no feature modals yet.
// A later Build Pack implements the overlay router (modal / bottom sheet / drawer / popover /
// fullscreen) with focus trap, tier/permission checks, and the locked Interaction Preservation
// Rule (restore scroll / card / map position on close).

export function ModalHost(): ReactNode {
  // TODO(frontend): mount the overlay router at the root shell.
  return null;
}
