# Host screens

Figma page: [01 Host](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2627)

File `PbAWCgi2JXiyl5PmbGvr9A`, page `01 Host` only. These frames are the host listing builder, listings, billing, public pricing, team, join, settings, verification, host-page editor, and public host page. Issue [#62](https://github.com/AutomatedEmpires/explore-and-earn/issues/62).

109 frames. Colors are bound to the `Color` collection (Light `5:0`, Dark `5:1`). Body copy is Figtree Regular at 16px, with size and line height bound to `text/16`. Buttons are the system Button at `lg` (48px) or `md` (44px). No button uses the Disabled state.

Sample host: Pinecrest Lodge, owner Jordan Hale. Sample job: Lodge Cook in West Yellowstone, MT, May 18, 2027 to Sep 12, 2027, 18 to 22 dollars an hour, a shared room at no cost, couples can share that room, two meals a day free on work days. Sample applicant: Maya Chen, Bend, OR.

## Tap counts

Typing is not counted. The notes sit on the page next to the frames.

**Flow C, publish a first listing.** Phone: 27 taps. 1 New listing. 2 Start blank. 3 Next, the job. 4 Next, where and when. 5 Next, pay. 6 to 13 the four housing photos (take, then use, for each). 14 Next, housing. 15 to 22 the four meal photos. 23 Next, meals. 24 Next, the work. 25 Take the cover. 26 Use the cover. 27 Publish. The prototype follows one camera trip (the bedroom). Each other photo is the same two taps. Desktop, after the words are typed: 6 taps. 1 New listing. 2 Start blank. 3 Add housing photos. 4 Add meal photos. 5 Add the cover. 6 Publish. The first listing then waits for the business check. The success screen says the job is in review, not live.

Phone prototype: [Empty](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2629) → [Start](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10808) → [Basics](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11198) → [Where](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11384) → [Pay](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11521) → [Housing](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11643) → [Camera](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11830) → [Meals](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11940) → [The work](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12041) → [Review](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143) → [In review](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13314).

Desktop prototype: [Start](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11060) → [Workspace](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) → [In review](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13530).

**Flow D, answer an applicant.** 2 taps: 1 Reply, 2 Send reply. Decline is 1 tap. Undo stays for 10 seconds and is not required.

Phone prototype: [Applicants](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13683) → [Reply](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14113) → [Reply sent](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14510). Decline goes to [Declined](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14771). Desktop uses the 1440 frames of the same three steps.

**Still hiring.** 1 tap: Yes, still hiring. The card then says Confirmed active today, Nov 10, 2026. Confirming does not move the job up in search. [Still hiring](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2966) → [Confirmed](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3551).

Other linked endings: Invite a teammate, Join the team, Send for a check, View public page, and Repost. Each starts on the 390 frame of that screen.

## How the widths are used

Phone frames are 390 wide and use the top bar (option A: icons, no role badge) plus the host bottom nav. The org name is in the page header, because the org switcher does not fit at 390. Tablet is 768 and desktop is 1440. Those use the system sidebar. Signed-out pages (`/pricing`, `/join`, `/hosts/pinecrest-lodge`) use the top bar with Sign in, and no sidebar.

The phone builder is one section per screen. The 768 and 1440 builder is one long form, with the guest card beside it at 1440 and under it at 768. The heading on that card is "What guests see".

## Frames

### Listings

| Frame | Node |
| --- | --- |
| 390 · Listings · Empty | [37:2629](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2629) |
| 768 · Listings · Empty | [37:2726](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2726) |
| 1440 · Listings · Empty | [37:2846](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2846) |
| 390 · Listings · Still hiring | [37:2966](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2966) |
| 768 · Listings · Still hiring | [37:3147](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3147) |
| 1440 · Listings · Still hiring | [37:3349](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3349) |
| 390 · Listings · Confirmed | [37:3551](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3551) |
| 768 · Listings · Confirmed | [37:3715](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3715) |
| 1440 · Listings · Confirmed | [37:3903](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3903) |
| 390 · Library | [46:19263](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19263) |
| 768 · Library | [49:14054](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-14054) |
| 1440 · Library | [46:19354](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19354) |
| 390 · Reposted | [46:19491](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19491) |

### Listing builder

| Frame | Node |
| --- | --- |
| Flow C note | [43:10803](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10803) |
| 390 · Builder · Start | [43:10808](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10808) |
| 768 · Builder · Start | [43:10922](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10922) |
| 1440 · Builder · Start | [43:11060](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11060) |
| 390 · Builder · Basics | [43:11198](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11198) |
| 390 · Builder · Where | [43:11384](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11384) |
| 390 · Builder · Pay | [43:11521](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11521) |
| 390 · Builder · Housing | [43:11643](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11643) |
| 390 · Builder · Camera | [43:11830](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11830) |
| 390 · Builder · Meals | [43:11940](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11940) |
| 390 · Builder · Job | [43:12041](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12041) |
| 390 · Builder · Review | [43:12143](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143) |
| 768 · Builder · Review | [43:12387](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12387) |
| 1440 · Builder · Review | [43:12655](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12655) |
| 390 · Builder · Pay error | [43:12923](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12923) |
| 768 · Builder · Pay error | [43:13038](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13038) |
| 1440 · Builder · Pay error | [43:13176](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13176) |
| 390 · Builder · Published | [43:13314](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13314) |
| 768 · Builder · Published | [43:13410](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13410) |
| 1440 · Builder · Published | [43:13530](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13530) |
| 390 · Builder · Offline | [43:13650](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13650) |
| 768 · Builder · Offline | [43:13746](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13746) |
| 1440 · Builder · Offline | [43:13865](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13865) |
| 768 · Builder · Workspace | [43:13984](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13984) |
| 1440 · Builder · Workspace | [43:14603](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) |

### Applicants, billing, pricing

| Frame | Node |
| --- | --- |
| Flow D note | [45:13679](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13679) |
| 390 · Applicants | [45:13683](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13683) |
| 768 · Applicants | [45:13795](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13795) |
| 1440 · Applicants | [45:13954](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13954) |
| 390 · Reply | [45:14113](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14113) |
| 768 · Reply | [45:14214](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14214) |
| 1440 · Reply | [45:14362](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14362) |
| 390 · Reply sent | [45:14510](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14510) |
| 768 · Reply sent | [49:13472](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13472) |
| 1440 · Reply sent | [45:14617](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14617) |
| 390 · Declined | [45:14771](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14771) |
| 768 · Declined | [49:13479](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13479) |
| 1440 · Declined | [45:14862](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14862) |
| 390 · Applicants offline | [45:15000](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15000) |
| 390 · Billing | [45:15095](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15095) |
| 768 · Billing | [45:15215](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15215) |
| 1440 · Billing | [45:15385](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15385) |
| 390 · Billing annual | [45:15555](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15555) |
| 768 · Billing annual | [49:13485](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13485) |
| 1440 · Billing annual | [45:15679](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15679) |
| 390 · Billing paid | [45:15853](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15853) |
| 768 · Billing paid | [49:13513](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13513) |
| 1440 · Billing paid | [45:15937](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15937) |
| 390 · Billing error | [45:16071](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16071) |
| 768 · Billing error | [49:13519](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13519) |
| 1440 · Billing error | [45:16155](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16155) |
| 390 · Billing offline | [45:16289](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16289) |
| 390 · Pricing | [45:16377](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16377) |
| 768 · Pricing | [45:16450](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16450) |
| 1440 · Pricing | [45:16523](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16523) |

Plans are Starter ($99 a month or $990 a year, 2 open jobs, 1 seat), Professional ($299 or $2,990, 10 open jobs, 5 seats), and Enterprise ($599 or $5,990, 30 open jobs, 15 seats). No add-ons. Seekers never pay. Public pricing uses the line "Hire people who want to be there."

### Team, settings, verification, host page

| Frame | Node |
| --- | --- |
| 390 · Team | [46:16274](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16274) |
| 768 · Team | [46:16367](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16367) |
| 1440 · Team | [46:16510](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16510) |
| 390 · Invite sent | [46:16653](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16653) |
| 390 · Team offline | [46:16737](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16737) |
| 390 · Join | [46:16825](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16825) |
| 768 · Join | [46:16860](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16860) |
| 1440 · Join | [46:16895](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16895) |
| 390 · Joined | [46:16930](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16930) |
| 390 · Invite expired | [46:16965](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16965) |
| 390 · Settings | [46:16994](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16994) |
| 768 · Settings | [46:17122](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17122) |
| 1440 · Settings | [46:17299](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17299) |
| 390 · Settings error | [46:17476](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17476) |
| 390 · Verification | [46:17582](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17582) |
| 768 · Verification | [49:14033](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-14033) |
| 1440 · Verification | [46:17682](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17682) |
| 390 · Verified | [46:17832](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17832) |
| 768 · Verified | [49:14040](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-14040) |
| 1440 · Verified | [46:17910](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17910) |
| 390 · Needs a document | [46:18038](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18038) |
| 390 · Verification offline | [46:18122](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18122) |
| 390 · Host editor | [46:18210](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18210) |
| 768 · Host editor | [46:18337](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18337) |
| 1440 · Host editor | [46:18514](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18514) |
| 390 · Host page | [46:18691](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18691) |
| 768 · Host page | [46:18842](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18842) |
| 1440 · Host page | [46:18990](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18990) |
| 390 · Host not hiring | [46:19138](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19138) |
| 768 · Host not hiring | [49:14045](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-14045) |
| 1440 · Host not hiring | [46:19181](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19181) |
| 390 · Host page offline | [46:19224](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19224) |

The public host page includes a remote job, Reservation agent, with the host based in West Yellowstone, MT and work from the US. That is the host-page side of the decision that Browse by State includes remote jobs.

### Dark mode

These are the key 390 screens with the Dark mode of the Color collection. Every other frame binds the same variables.

| Frame | Node |
| --- | --- |
| 390 · Listings · Still hiring · Dark | [46:19620](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19620) |
| 390 · Builder · Review · Dark | [46:19656](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19656) |
| 390 · Builder · Camera · Dark | [46:19683](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19683) |
| 390 · Applicants · Dark | [46:19695](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19695) |
| 390 · Billing · Dark | [46:19713](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19713) |
| 390 · Host page · Dark | [46:19743](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19743) |
| 390 · Settings · Dark | [46:19760](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19760) |
| 390 · Team · Dark | [46:19771](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19771) |
| 390 · Verification · Dark | [46:19788](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19788) |

## Gaps

- JobCard has no slots for housing type, housing cost, couples, or room photos. Those facts sit under the card, after the heading "What guests see". The pay chip on the card is set to `$18-$22/hr`.
- JobCard still shows the system Seasonal badge. That hue is the one issue #85 is changing so category colors do not look like status colors. Listing rows on the host listings screen use a neutral Seasonal badge instead of CategoryBadge. This page does not edit page 00 System.
- The shared Sidebar still contains Promote. The founder decision is plans only, with no add-ons. Billing and pricing on this page have no add-on purchase. The sidebar was not detached.
- The system has three place illustrations (lake, harbor, farm). Housing, meal, and cover photos reuse them. There are no room photographs in the system.
- There is no `text-16/regular` style. Body copy uses Figtree Regular with the `text/16` size and line-height variables.
- Some endings are drawn at 390 only: applicants offline, team offline, invite sent, joined, invite expired, settings error, needs a document, verification offline, host page offline, billing offline, and reposted. The key screen for each of those flows has 390, 768, and 1440.
- The phone builder steps (basics, where, pay, housing, camera, meals, the work) are 390 only. The same fields are the 768 and 1440 workspace.
- Dark mode is drawn for nine key 390 frames. The other frames use the same bound variables.
