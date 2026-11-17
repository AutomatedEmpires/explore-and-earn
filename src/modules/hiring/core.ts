// Pipeline transition types. Task 8 fills the functions beside them.
import type { Actor } from '@/lib/applications';
import type { ApplicationStatus, PipelineEventKind } from '@/lib/hiring';
import type { pipelineEntries } from './schema';

export type PipelineEntryRow = typeof pipelineEntries.$inferSelect;

export type TransitionInput = {
  applicationId: string;
  from: ApplicationStatus[];
  to: ApplicationStatus;
  actor: Actor;
  eventKind: PipelineEventKind;
  hiredSource?: 'host' | 'offer_accepted';
};

export async function transitionStatus(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: transitionStatus (W0)');
}

export async function mirrorStatus(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: mirrorStatus (W0)');
}

export async function recordPipelineEvent(..._args: unknown[]): Promise<void> {
  throw new Error('not implemented: recordPipelineEvent (W0)');
}

export function staleStatus(..._args: unknown[]): never {
  throw new Error('not implemented: staleStatus (W0)');
}
