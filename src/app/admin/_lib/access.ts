// Queue assignment is the console's access boundary (spec section 12). The rules live in the
// operator module (coversQueue, mayOpenItem, listReviewItems' visibleTo); this turns the
// guard's operator into the viewer they take.
import type { ItemViewer } from '@/modules/operator';
import type { OperatorContext } from '@/server/guards';

export function itemViewer(operator: OperatorContext): ItemViewer {
  return { userId: operator.user.id, role: operator.role, queues: operator.queues };
}
