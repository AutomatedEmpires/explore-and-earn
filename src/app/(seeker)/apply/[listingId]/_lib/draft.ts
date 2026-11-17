// The in-progress application lives on the phone, not on the server (SP4 spec 8.4). The
// engineering decision is sessionStorage under `apply:<listingId>`, cleared after a successful
// send. A private window or a full store must not break the page.
import type { ApplyContextDto } from '@/lib/applications';

export type AnswerValue = string | boolean | string[];

export type Draft = {
  firstName: string;
  lastName: string;
  city: string;
  region: string;
  workAuthorization: '' | 'authorized' | 'needs_sponsorship';
  answers: Record<string, AnswerValue>;
};

export function emptyDraft(): Draft {
  return {
    firstName: '',
    lastName: '',
    city: '',
    region: '',
    workAuthorization: '',
    answers: {},
  };
}

export function draftKey(listingId: string): string {
  return `apply:${listingId}`;
}

function isDraft(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Draft>;
  return (
    typeof v.firstName === 'string' &&
    typeof v.lastName === 'string' &&
    typeof v.city === 'string' &&
    typeof v.region === 'string' &&
    (v.workAuthorization === '' ||
      v.workAuthorization === 'authorized' ||
      v.workAuthorization === 'needs_sponsorship') &&
    typeof v.answers === 'object' &&
    v.answers !== null
  );
}

export function loadDraft(listingId: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(listingId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(listingId: string, draft: Draft): void {
  try {
    sessionStorage.setItem(draftKey(listingId), JSON.stringify(draft));
  } catch {
    // The phone refused the write. The seeker can still send this session.
  }
}

export function clearDraft(listingId: string): void {
  try {
    sessionStorage.removeItem(draftKey(listingId));
  } catch {
    // Nothing stored, or storage is blocked.
  }
}

/** A question counts as answered when the stored value is not empty. */
export function isAnswered(
  question: ApplyContextDto['questions'][number],
  value: AnswerValue | undefined,
): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return !question.required || value.length > 0;
  return value.trim() !== '';
}
