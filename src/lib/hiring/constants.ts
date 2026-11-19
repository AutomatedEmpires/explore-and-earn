// Hiring limits (SP5 spec 8.4–8.6). Client-safe.
export const PASS_UNDO_MS = 10_000;

export const APPLICANTS = { defaultLimit: 25, maxLimit: 50 };
export const POOL = { queryLimit: 500, refreshAfterHours: 6, pageSize: 24, maxSkillFilters: 5 };
export const INVITES = { noteMax: 300, expiryDays: 14, reminderHoursBefore: 48 };
export const INTERVIEWS = {
  minLeadMinutes: 60,
  maxAheadDays: 90,
  durations: [15, 30, 45, 60, 90],
  defaultDuration: 30,
  expiryHours: [48, 72],
  defaultExpiryHours: 72,
  noteMax: 500,
  phoneNoteMax: 200,
  addressMax: 300,
  cancelReasonMax: 300,
  maxWindows: 3,
  minWindowMinutes: 30,
  windowsMaxAheadDays: 60,
  requestNoteMax: 300,
  autoCompleteHours: 48,
};
export const OFFERS = { positionMax: 120, noteMax: 1000 };
export const AS_DESCRIBED = {
  openDays: 60,
  ongoingDueDays: 90,
  hostPageMinResponses: 5,
  analyticsMinResponses: 3,
};
export const RATE_LIMITS = {
  invites: { limit: 100, windowSec: 3600 },
  interviews: { limit: 30, windowSec: 3600 },
  export: { limit: 20, windowSec: 3600 },
};
