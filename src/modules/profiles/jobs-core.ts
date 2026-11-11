// The profiles module's own job handlers (SP4 spec 6). W0 stub: W1 implements the sweep handler
// (Task 10). The stub handler is a no-op, so the scheduled topic never goes dead.
import type { HandlerMap } from '@/modules/jobs';

export const AVAILABILITY_SWEEP_TOPIC = 'profiles.availability_sweep';

export const coreJobHandlers: HandlerMap = {
  [AVAILABILITY_SWEEP_TOPIC]: async () => {},
};
