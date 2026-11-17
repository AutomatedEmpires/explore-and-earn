// Profile copy the spec quotes (SP4 spec 8.3 and 8.6), used verbatim by the API and the screens.
// Client-safe.
import type { MissingItem } from './types';

/** The Profile hub's missing-item line, shown only while "Visible to hosts" is on (spec 8.3). */
export const MISSING_ITEM_LINES: Record<MissingItem, string> = {
  name: 'Add your name so hosts can find you',
  location: 'Add your general location so hosts can find you',
  availability: 'Add your availability so hosts can find you',
  availability_stale: 'Confirm your availability so hosts can find you',
  category: 'Add a job category or occupation so hosts can find you',
  work_authorization: 'Add your work authorization so hosts can find you',
};

/** Under the "Visible to hosts" switch (spec 8.3). */
export const VISIBILITY_HELPER =
  "Hosts you've applied to or said Interested to can still see your profile.";

/** The consent dialog before the first AI import (spec 8.6.1). */
export const AI_CONSENT_TEXT =
  "We'll send this file to our AI provider, Anthropic, to fill in your profile. It isn't used to train AI. You review every field before anything is saved.";

/** An import that failed, or that the model refused (spec 8.6.5). */
export const IMPORT_FAILED = "We couldn't read this file. You can fill in your profile by hand.";

/** An import that read nothing (spec 7, `/profile/import/[id]`). */
export const IMPORT_EMPTY = 'Nothing we could read in this file. Fill in your profile by hand.';

/** Writing help failed (spec 8.6). */
export const WRITING_HELP_UNAVAILABLE = "Writing help isn't available right now.";

/** Every certification carries this label (spec 7 and 10). */
export const SELF_REPORTED = 'Self-reported';
