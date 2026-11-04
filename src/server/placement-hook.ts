// Boosted placement touchpoint (SP3 spec 3 and 8.13). SP6 replaces the one line below with its
// implementation; until then search and the map get organic results and no boosted labels.
import { noopHook, type BoostPlacementHook } from '@/modules/discovery';

export const boostPlacementHook: BoostPlacementHook = noopHook;
