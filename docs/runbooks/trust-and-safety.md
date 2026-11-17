# Trust and safety

Draft for the operator on duty. Not legal advice. The child-safety queue owner below is the legal review's proposal and stays pending until the founder names the backup.

## Words we do not use

Do not describe a host as verified, trusted, or safe. Say which check ran and the date it ran. A business check and a PhotoDNA scan are checks, not a promise about the host.

## Queue triage

Listing screening runs the deterministic fraud rules before the classifier. A match opens a moderation item and leaves the listing unpublished. The rules never approve a listing. If a rule or the classifier errors, the listing stays unpublished.

Review moderation items in this order:

1. A child-safety item. Follow [child safety](child-safety.md). Do not handle it from this page.
2. `pay_to_apply`. The listing asks the seeker for a fee, a deposit, paid training, or a background check.
3. `off_platform_payment`. The listing or a message asks for gift cards, crypto, a wire, a payment app, or an off-platform chat.
4. `deposit_only_in_messages`. A deposit or fee is in a message and is not stated in the listing's housing section. A deposit that belongs to housing is written in that section.
5. `duplicate_listing`. The text or photos repeat another organization's listing, including a copy from a new account.
6. Classifier flags that are not one of the rules above.

A match is a reason to look. The operator decides. Publishing over an open fraud item is not the default.

## Child safety

The CSAM and NCMEC path, including the report under 18 U.S.C. § 2258A, evidence in the locked bucket, and the quarterly drill, is in [child safety](child-safety.md). This page does not restate that procedure.

Proposal, pending the founder: the founder is the primary reporter and names one human backup before launch. The backup is not an AI agent and not an unnamed person on duty. Until the founder names that person, the backup slot stays empty and the child-safety gate stays unattested.

## Evidence for a fraud report

Keep the listing revision, the message, the moderation item, and the audit row. Do not delete them to clear the queue. Do not copy message text or documents into the incident notes. Child-safety files are not stored with these notes; they stay on the path in [child safety](child-safety.md).

## Host suspension and seeker notice

When a host is taking money, impersonating an employer, or copying another organization's listing: suspend the organization, hide its listings, and stop new applications. If seekers already applied or messaged, send the notice in [breach response](breach-response.md). An operator may suspend the account. The founder decides whether a regulator notice is also required.

## PhotoDNA staging probe

Run `pnpm exec tsx --import ./scripts/register-server-only.mjs scripts/photodna-probe.ts` with `CHILD_SAFETY_PROVIDER=photodna` in staging. Doppler supplies `PHOTODNA_KEY`. The script reports a live match or no-match, and it reports that a rate-limit response is rejected rather than treated as a no-match. It does not print the key. If the output says `PHOTODNA_KEY is not set`, ask the founder for `PHOTODNA_KEY` by that name and ship the rest without it.

A timeout, a rate limit, or a format the scanner cannot read fails closed: the file is not published and is not recorded as a no-match.
