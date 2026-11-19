// Flow D's calls to the SP5 host hiring and messaging API (no new contracts): the applicants
// list, Pass and its Undo, Shortlist, one applicant's detail, the thread and sending a reply.
// Errors are SP4's ApiError; a request that never reached the server has status 0.
import { ApiError, apiFetch } from '@/app/_features/api';
import type { ApplicantCardData, ApplicantDetail, ApplicationStatus } from '@/lib/hiring';
import type { MessageView, ThreadView } from '@/lib/messaging';
import { applicantsQuery } from './model';

export { ApiError };

export type ApplicantsPage = {
  items: ApplicantCardData[];
  counts: Partial<Record<ApplicationStatus, number>>;
  nextCursor: string | null;
};

const applicant = (id: string) => `/api/v1/host/applicants/${encodeURIComponent(id)}`;
const thread = (id: string) => `/api/v1/threads/${encodeURIComponent(id)}`;

export const hiringApi = {
  listWaiting: (cursor?: string | null) =>
    apiFetch<ApplicantsPage>(`/api/v1/host/applicants?${applicantsQuery(cursor)}`),
  pass: (applicationId: string) =>
    apiFetch<{ undoUntil: string }>(`${applicant(applicationId)}/pass`, { method: 'POST' }),
  undoPass: (applicationId: string) =>
    apiFetch<{ status: ApplicationStatus }>(`${applicant(applicationId)}/pass/undo`, {
      method: 'POST',
    }),
  shortlist: (applicationId: string, on: boolean) =>
    apiFetch<{ status: ApplicationStatus }>(`${applicant(applicationId)}/shortlist`, {
      method: 'POST',
      json: { on },
    }),
  detail: (applicationId: string) => apiFetch<ApplicantDetail>(applicant(applicationId)),
  thread: (threadId: string) => apiFetch<ThreadView>(thread(threadId)),
  sendReply: (threadId: string, input: { clientId: string; body: string }) =>
    apiFetch<{ message: MessageView }>(`${thread(threadId)}/messages`, {
      method: 'POST',
      json: input,
    }),
};

/** The request never reached the server. */
export function isOffline(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

export function isStatus(err: unknown, status: number): boolean {
  return err instanceof ApiError && err.status === status;
}

export function reasonOf(err: unknown): string | null {
  return err instanceof ApiError ? err.reason : null;
}
