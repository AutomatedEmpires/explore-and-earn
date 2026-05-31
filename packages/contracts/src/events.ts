export const CORE_EVENT_TYPES = ["scope_changed"] as const;

export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];

// TODO: Expand this catalogue from the canonical event registry before feature
// implementation begins.