// From inside one module: another module through its index, and this module's own files.
import { runCheck } from '../trust';
import { record } from '@/modules/audit';
import { notify } from '../notifications/index';
import { media } from './schema';
import { jobKey } from '../media/uploads';

export const all = [runCheck, record, notify, media, jobKey];
