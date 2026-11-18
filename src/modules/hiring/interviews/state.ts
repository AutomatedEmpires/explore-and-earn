// The pipeline mirror of the open interview or offer.
import { eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db';
import { pipelineEntries } from '../schema';

export async function setInterviewState(tx: Tx, applicationId: string, state: string): Promise<void> {
  await tx
    .update(pipelineEntries)
    .set({ interviewState: state })
    .where(eq(pipelineEntries.applicationId, applicationId));
}

export async function setOfferState(tx: Tx, applicationId: string, state: string | null): Promise<void> {
  await tx
    .update(pipelineEntries)
    .set({ offerState: state })
    .where(eq(pipelineEntries.applicationId, applicationId));
}
