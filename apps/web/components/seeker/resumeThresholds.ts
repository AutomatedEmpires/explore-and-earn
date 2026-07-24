/**
 * Résumé thresholds, kept in a leaf module with no imports.
 *
 * `resume.ts` also exports fixture data (SEEKER_STATUS, RESUME_PROGRESS), which
 * chains through ./models into the discovery barrel and pulls .tsx files with
 * it. Importing a constant from there therefore drags a component graph into
 * anything that only wanted a number — including unit tests, which cannot
 * transform apps/web JSX. Keeping the value here lets the honest completion
 * logic be imported and tested on its own.
 */

/**
 * Completion at which the résumé is presented as strong enough for confident
 * matching. This is a RECOMMENDATION, not a gate: whether a seeker may apply is
 * decided solely by seekerResumeCompletion().complete in @explore-and-earn/db.
 */
export const RESUME_RECOMMENDED_THRESHOLD = 85;
