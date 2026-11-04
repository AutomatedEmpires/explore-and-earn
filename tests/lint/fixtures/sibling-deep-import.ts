// From inside one module, a relative path into another module's internals.
import { transact } from '../trust/internal';
export * from '../trust/schema';

export const run = transact;
export const lazy = () => import('../trust/routing');
