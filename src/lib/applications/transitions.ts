// The status transition table and the seeker's view of each status (SP4 spec 8.5). Client-safe
// and pure. The database does not enforce the table: every status write goes through
// @/modules/applications (setStatus and withdraw), which checks canTransition first.
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

const SEEKER_VIEW: Record<ApplicationStatus, SeekerStatus> = {
  new: 'applied',
  shortlisted: 'applied',
  interviewing: 'interviewing',
  offered: 'offer',
  hired: 'hired',
  not_selected: 'not_selected',
  withdrawn: 'withdrawn',
  offer_declined: 'offer_declined',
};

/** How a status reads to the seeker: `new` and `shortlisted` are both Applied. */
export function seekerStatus(s: ApplicationStatus): SeekerStatus {
  return SEEKER_VIEW[s];
}

/** Whether `actor` may move an application from `from` to `to`. 'system' = host ∪ seeker. */
export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: Actor['type'],
): boolean {
  const allowed = TRANSITIONS[from];
  if (actor === 'system') return allowed.host.includes(to) || allowed.seeker.includes(to);
  return allowed[actor].includes(to);
}
