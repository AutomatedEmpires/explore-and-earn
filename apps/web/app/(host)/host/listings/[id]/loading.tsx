import { HostDetailSkeleton } from "../../../../../components/host";

/**
 * Loading placeholder for the listing detail route. Shown during async
 * navigation so the transition never flashes a blank screen.
 */
export default function Loading() {
  return <HostDetailSkeleton />;
}
