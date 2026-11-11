// The status transition table and the seeker's view of each status (SP4 spec 8.5). Client-safe
// and pure. The table is spec data, landed by W0 so the contract test can see it; W4 owns this
// file from Phase B and implements the two functions (Task 19).
import type { Actor, ApplicationStatus, SeekerStatus, TransitionTable } from './types';

export const TRANSITIONS: TransitionTable = {
  new: {
    host: ['shortlisted', 'interviewing', 'offered', 'hired', 'not_selected'],
    seeker: ['withdrawn'],
  },
  shortlisted: {
    host: ['new', 'interviewing', 'offered', 'hired', 'not_selected'],
    seeker: ['withdrawn'],
  },
  interviewing: {
    host: ['shortlisted', 'offered', 'hired', 'not_selected'],
    seeker: ['withdrawn'],
  },
  offered: {
    host: ['interviewing', 'hired', 'not_selected'],
    seeker: ['hired', 'offer_declined', 'withdrawn'],
  },
  offer_declined: { host: ['offered'], seeker: [] },
  hired: { host: [], seeker: [] },
  not_selected: { host: [], seeker: [] },
  withdrawn: { host: [], seeker: [] },
};

/** How a status reads to the seeker: `new` and `shortlisted` are both Applied. */
export function seekerStatus(_s: ApplicationStatus): SeekerStatus {
  throw new Error('not implemented: seekerStatus');
}

/** Whether `actor` may move an application from `from` to `to`. 'system' = host ∪ seeker. */
export function canTransition(
  _from: ApplicationStatus,
  _to: ApplicationStatus,
  _actor: Actor['type'],
): boolean {
  throw new Error('not implemented: canTransition');
}
