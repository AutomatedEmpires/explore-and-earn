// An organization's display name, in its own file so identity and org settings can read it
// while the orgs barrel is still loading. create.ts and onboarding.ts import each other through
// that barrel; defining the schema there left it undefined for whichever side loaded second.
import { z } from 'zod';

/** An organization's display name: 2-80 characters after trimming. */
export const organizationNameSchema = z
  .string()
  .trim()
  .min(2, 'Organization name must be at least 2 characters')
  .max(80, 'Organization name must be at most 80 characters');
