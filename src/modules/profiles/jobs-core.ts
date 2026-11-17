// The profiles module's own job handlers (SP4 spec 6). The daily sweep uses the job's clock.
import type { HandlerMap } from '@/modules/jobs';
import { availabilitySweep } from './availability-store';

export const AVAILABILITY_SWEEP_TOPIC = 'profiles.availability_sweep';

export const coreJobHandlers: HandlerMap = {
  [AVAILABILITY_SWEEP_TOPIC]: async (_payload, ctx) => {
    await availabilitySweep(ctx.db, ctx.now);
  },
};
