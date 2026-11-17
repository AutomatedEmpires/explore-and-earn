// Hiring outbox topics. Each one delegates to a named function. A missing context is a
// registry probe, not a job, so it does nothing.
import type { HandlerMap } from '@/modules/jobs';
import { asDescribedDue } from './as-described/due';
import { refreshFit } from './fit-store';
import { onMemberRemoved } from './interviews/close';
import { sendInterviewReminder } from './interviews/reminders';
import { sweepInterviews } from './interviews/sweep';
import { sweepInvites } from './invites/sweep';
import { runNoteScan } from './notes';
import {
  onAdditionalStepChanged,
  onApplicationSubmitted,
  onApplicationWithdrawn,
} from './pipeline/handlers';
import { commitPass } from './pipeline/pass';

export const jobHandlers: HandlerMap = {
  'hiring.application_submitted': async (payload, ctx) => {
    if (!ctx) return;
    await onApplicationSubmitted(ctx.db, payload);
  },
  'hiring.application_withdrawn': async (payload, ctx) => {
    if (!ctx) return;
    await onApplicationWithdrawn(ctx.db, payload);
  },
  'hiring.additional_step_changed': async (payload, ctx) => {
    if (!ctx) return;
    await onAdditionalStepChanged(ctx.db, payload);
  },
  'hiring.member_removed': async (payload, ctx) => {
    if (!ctx) return;
    await onMemberRemoved(ctx.db, payload);
  },
  'hiring.commit_pass': async (payload, ctx) => {
    if (!ctx) return;
    await commitPass(ctx.db, payload, ctx.now);
  },
  'hiring.interview_reminder': async (payload, ctx) => {
    if (!ctx) return;
    await sendInterviewReminder(ctx.db, payload, ctx.now);
  },
  'hiring.scan_note': async (payload, ctx) => {
    if (!ctx) return;
    await runNoteScan(ctx.db, payload);
  },
  'hiring.sweep': async (_payload, ctx) => {
    if (!ctx) return;
    await sweepInvites(ctx.db, ctx.now);
    await sweepInterviews(ctx.db, ctx.now);
  },
  'hiring.fit_refresh': async (_payload, ctx) => {
    if (!ctx) return;
    await refreshFit(ctx.db, ctx.now);
  },
  'hiring.as_described_due': async (_payload, ctx) => {
    if (!ctx) return;
    await asDescribedDue(ctx.db, ctx.now);
  },
};
