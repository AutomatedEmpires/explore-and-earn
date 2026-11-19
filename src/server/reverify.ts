// Clerk reverification for sensitive host actions (SP2 spec section 5): transferring ownership
// and deleting the organization. "reverify" means Clerk `has({ reverification: 'strict' })`.
import { auth } from '@clerk/nextjs/server';
import { forbidden } from '@/lib/errors';

/**
 * Throws 403 `forbidden` with `details.reason = 'reverification_required'` unless the session
 * reverified within Clerk's `strict` window. The client reacts by prompting for reverification.
 */
export async function requireReverification(): Promise<void> {
  const { has } = await auth();
  if (!has({ reverification: 'strict' })) {
    throw forbidden('Confirm it is you to continue', {
      reason: 'reverification_required',
      reverification: 'strict',
    });
  }
}
