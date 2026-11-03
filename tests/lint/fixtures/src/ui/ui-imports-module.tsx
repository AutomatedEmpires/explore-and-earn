// Design-system code must not depend on domain modules.
import { notify } from '@/modules/notifications';

export function Bell() {
  return <button type="button" onClick={() => void notify}>Notify</button>;
}
