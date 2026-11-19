# Hiring screens

Issue [#64](https://github.com/AutomatedEmpires/explore-and-earn/issues/64). Figma only. No UI code.

- **File:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A
- **Page 03 Hiring:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-4379
- **Frames:** 146. Each link below opens that frame.
- **Built from:** page 00 System components and variables. Colors are bound to the Color collection (Light `5:0`, Dark `5:1`). Body copy is Figtree Regular at 16px, with size and line height bound to `text/16`. Buttons are the system Button at `lg` (48px). No button uses the Disabled state. Touch targets used here are at least 44px.

The top bar is option A: wordmark and icons, no role badge. Host phones use that bar plus the host bottom nav. Host 768 and 1440 use the sidebar. Seeker phones use the seeker bottom tabs. Seeker 768 and 1440 turn on the desktop links and drop the bottom tabs.

The host is Pinecrest Lodge. Jordan Hale is the owner. The open job is Lodge Cook in West Yellowstone, MT, May 18 to Sep 12, 2027, $18 to $22 an hour, a shared room at no cost, couples can share that room, two meals a day on work days. Applicants are Maya Chen (Bend, OR), Alex Kim (Bozeman, MT), Sam Ortega (interview), and Casey Nguyen (offer). The plan line is Professional, $299 a month or $2,990 a year, 1 of 10 jobs open. No add-ons.

The seeker is Maya Reyes of Missoula, MT. Her profile is the resume. Her first application is Lodge housekeeper at Kettle Ridge Lodge, sent Nov 8, 2026. The host usually replies in 1 day. The second application is Ranch hand at Red Creek Ranch, Sheridan, WY, $18 an hour, a free bunkhouse, no meals, couples can share a room, May 1 to Sep 15, 2027, confirmed active Nov 9, 2026.

Notes on the page sit outside the screens. They are not product copy.

## Tap counts

| Flow | Taps | Path |
| --- | --- | --- |
| B. Returning seeker, second application | 3 | Open the ranch job. Apply. Send application. The profile, the May 15 start, and the answer are already there. |
| D. Reply from the pipeline, the inbox, or Home | 2 | Reply. Send reply. |
| D. Decline one person | 2 | Decline. Send note. Undo stays for 10 seconds and is not required. |
| D. Decline two people | 3 | Select people to decline. Decline 2. Send note. |
| Interview step | 1 from that screen | Send times. Sam has 72 hours to pick. |
| Offer step | 1 from that screen | Send offer. |
| Still hiring | 1 | Yes, still hiring. The home then says confirmed active today, Nov 10, 2026. |

The first application, including the account, stays on page 02 Seeker. This page starts once the profile exists.

## Prototype

The same links are on the 390, 768, and 1440 frames. Replace `390` in the names below with `768` or `1440` for the other widths.

| From | Control | To |
| --- | --- | --- |
| Ranch job | Apply | Apply |
| Apply | Send application | Apply sent |
| Apply sent | View your applications | Applications |
| Apply · Error | Try again | Apply |
| Apply · Offline | Try again | Apply |
| Visa warning | Apply anyway | Apply sent |
| Visa warning | Go back | Ranch job |
| Job changed | Review the job | Apply |
| Host home | Reply | Reply |
| Host home | Decline | Decline |
| Host home | Yes, still hiring | Host home · Confirmed |
| Host home | See all 4 | Pipeline |
| Pipeline | Reply | Reply |
| Pipeline | Decline | Decline |
| Pipeline | Select people to decline | Pipeline · Selected |
| Pipeline · Selected | Decline 2 | Decline two |
| Reply | Send reply | Reply sent |
| Reply sent | Set a time | Interview |
| Decline | Send note | Declined |
| Decline two | Send note | Declined two |
| Interview | Send times | Interview sent |
| Interview sent | Write an offer | Offer |
| Offer | Send offer | Offer sent |
| Inbox | Reply | Reply |
| Inbox | Decline | Decline |
| Thread | Send reply | Reply sent |
| Thread | Decline | Decline |
| Seeker inbox | Reply | Seeker thread |
| Profile | View application | Applications |
| Profile | Open resume | Resume |

## How the widths are used

Phone frames are 390 wide. On 1440, prose and cards are 640 wide so a line stays near 45 to 75 characters. Stats on host Home stay in a row of three. One primary button per screen. A second person on the same screen uses a secondary Reply, which still sends.

Text messages are off. The screens say replies go by email and in the app. There is no text-message control. The cap is 0.

Every application screen shows the status, the host's usual reply time, and "You never pay to get a job." The apply step says "Saved on this phone."

## Frames

### Host home

| Frame | Node |
| --- | --- |
| 390 · Host home | [63:4381](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-4381) |
| 768 · Host home | [63:4536](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-4536) |
| 1440 · Host home | [63:4711](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-4711) |
| 390 · Host home · Empty | [63:4887](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-4887) |
| 768 · Host home · Empty | [63:4974](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-4974) |
| 1440 · Host home · Empty | [63:5086](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5086) |
| 390 · Host home · Offline | [63:5198](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5198) |
| 768 · Host home · Offline | [63:5284](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5284) |
| 1440 · Host home · Offline | [63:5395](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5395) |
| 390 · Host home · Error | [63:5506](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5506) |
| 768 · Host home · Error | [63:5592](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5592) |
| 1440 · Host home · Error | [63:5703](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5703) |
| 390 · Host home · Confirmed | [63:5814](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5814) |
| 768 · Host home · Confirmed | [63:5958](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-5958) |
| 1440 · Host home · Confirmed | [63:6127](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-6127) |
| 390 · Host home · Dark | [63:6297](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=63-6297) |

### Pipeline, decline, interview, and offer

| Frame | Node |
| --- | --- |
| 390 · Pipeline | [64:12812](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-12812) |
| 768 · Pipeline | [64:12981](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-12981) |
| 1440 · Pipeline | [64:13160](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-13160) |
| 390 · Pipeline · Selected | [64:13339](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-13339) |
| 768 · Pipeline · Selected | [64:13476](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-13476) |
| 1440 · Pipeline · Selected | [64:13628](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-13628) |
| 390 · Decline | [64:13780](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-13780) |
| 768 · Decline | [64:13895](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-13895) |
| 1440 · Decline | [64:14025](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14025) |
| 390 · Decline two | [64:14155](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14155) |
| 768 · Decline two | [64:14270](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14270) |
| 1440 · Decline two | [64:14400](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14400) |
| 390 · Declined | [64:14530](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14530) |
| 768 · Declined | [64:14634](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14634) |
| 1440 · Declined | [64:14753](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14753) |
| 390 · Declined two | [68:32193](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-32193) |
| 768 · Declined two | [68:32225](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-32225) |
| 1440 · Declined two | [68:32325](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-32325) |
| 390 · Pipeline · Empty | [64:14872](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14872) |
| 768 · Pipeline · Empty | [64:14967](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-14967) |
| 1440 · Pipeline · Empty | [64:15077](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15077) |
| 390 · Pipeline · Offline | [64:15187](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15187) |
| 768 · Pipeline · Offline | [64:15281](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15281) |
| 1440 · Pipeline · Offline | [64:15390](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15390) |
| 390 · Pipeline · Error | [64:15499](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15499) |
| 768 · Pipeline · Error | [64:15593](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15593) |
| 1440 · Pipeline · Error | [64:15702](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15702) |
| 390 · Pipeline · Dark | [68:31839](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31839) |

| Frame | Node |
| --- | --- |
| 390 · Reply | [64:15840](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15840) |
| 768 · Reply | [64:15955](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-15955) |
| 1440 · Reply | [64:16085](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-16085) |
| 390 · Reply sent | [64:16215](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-16215) |
| 768 · Reply sent | [64:16317](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-16317) |
| 1440 · Reply sent | [64:16434](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-16434) |
| 390 · Interview | [64:16551](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-16551) |
| 768 · Interview | [64:16709](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-16709) |
| 1440 · Interview | [64:16882](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-16882) |
| 390 · Interview sent | [64:17055](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17055) |
| 768 · Interview sent | [64:17157](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17157) |
| 1440 · Interview sent | [64:17274](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17274) |
| 390 · Offer | [64:17391](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17391) |
| 768 · Offer | [64:17508](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17508) |
| 1440 · Offer | [64:17640](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17640) |
| 390 · Offer sent | [64:17772](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17772) |
| 768 · Offer sent | [64:17867](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17867) |
| 1440 · Offer sent | [64:17977](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-17977) |

### Host inbox

| Frame | Node |
| --- | --- |
| 390 · Inbox | [64:18087](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-18087) |
| 768 · Inbox | [64:18219](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-18219) |
| 1440 · Inbox | [64:18365](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-18365) |
| 390 · Thread | [64:18511](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-18511) |
| 768 · Thread | [64:18636](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-18636) |
| 1440 · Thread | [64:18775](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-18775) |
| 390 · Inbox · Empty | [64:18914](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-18914) |
| 768 · Inbox · Empty | [64:19009](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-19009) |
| 1440 · Inbox · Empty | [64:19118](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-19118) |
| 390 · Inbox · Offline | [64:19227](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-19227) |
| 768 · Inbox · Offline | [64:19322](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-19322) |
| 1440 · Inbox · Offline | [64:19431](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-19431) |
| 390 · Inbox · Error | [64:19540](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-19540) |
| 768 · Inbox · Error | [64:19635](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-19635) |
| 1440 · Inbox · Error | [64:19744](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=64-19744) |
| 390 · Inbox · Dark | [68:31877](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31877) |

### Seeker profile, resume, and applications

| Frame | Node |
| --- | --- |
| 390 · Profile | [68:27601](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-27601) |
| 768 · Profile | [68:27717](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-27717) |
| 1440 · Profile | [68:27815](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-27815) |
| 390 · Profile · Need a date | [68:27913](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-27913) |
| 768 · Profile · Need a date | [68:27981](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-27981) |
| 1440 · Profile · Need a date | [68:28032](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28032) |
| 390 · Profile · Saved | [68:28083](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28083) |
| 768 · Profile · Saved | [68:28198](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28198) |
| 1440 · Profile · Saved | [68:28296](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28296) |
| 390 · Profile · Offline | [68:28394](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28394) |
| 768 · Profile · Offline | [68:28461](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28461) |
| 1440 · Profile · Offline | [68:28511](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28511) |
| 390 · Profile · Error | [68:28561](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28561) |
| 768 · Profile · Error | [68:28628](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28628) |
| 1440 · Profile · Error | [68:28678](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28678) |
| 390 · Profile · Dark | [68:31902](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31902) |
| 390 · Headline | [68:28728](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28728) |
| 768 · Headline | [68:28808](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28808) |
| 1440 · Headline | [68:28871](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28871) |
| 390 · Resume | [68:28934](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-28934) |
| 768 · Resume | [68:29018](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29018) |
| 1440 · Resume | [68:29085](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29085) |
| 390 · Import | [68:29152](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29152) |
| 768 · Import | [68:29227](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29227) |
| 1440 · Import | [68:29285](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29285) |
| 390 · Import saved | [68:29343](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29343) |
| 768 · Import saved | [68:29411](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29411) |
| 1440 · Import saved | [68:29462](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29462) |
| 390 · Applications | [68:29513](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29513) |
| 768 · Applications | [68:29586](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29586) |
| 1440 · Applications | [68:29642](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29642) |

### Apply and seeker inbox

| Frame | Node |
| --- | --- |
| 390 · Ranch job | [68:29698](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29698) |
| 768 · Ranch job | [68:29768](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29768) |
| 1440 · Ranch job | [68:29821](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29821) |
| 390 · Apply | [68:29874](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29874) |
| 768 · Apply | [68:29947](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-29947) |
| 1440 · Apply | [68:30003](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30003) |
| 390 · Apply sent | [68:30059](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30059) |
| 768 · Apply sent | [68:30136](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30136) |
| 1440 · Apply sent | [68:30194](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30194) |
| 390 · Apply · Error | [68:30252](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30252) |
| 768 · Apply · Error | [68:30319](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30319) |
| 1440 · Apply · Error | [68:30369](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30369) |
| 390 · Apply · Offline | [68:30419](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30419) |
| 768 · Apply · Offline | [68:30486](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30486) |
| 1440 · Apply · Offline | [68:30536](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30536) |
| 390 · Visa warning | [68:30586](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30586) |
| 768 · Visa warning | [68:30660](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30660) |
| 1440 · Visa warning | [68:30717](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30717) |
| 390 · Job changed | [68:30774](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30774) |
| 768 · Job changed | [68:30841](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30841) |
| 1440 · Job changed | [68:30891](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30891) |
| 390 · Apply · Dark | [68:31925](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31925) |

| Frame | Node |
| --- | --- |
| 390 · Seeker inbox | [68:30941](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-30941) |
| 768 · Seeker inbox | [68:31012](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31012) |
| 1440 · Seeker inbox | [68:31066](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31066) |
| 390 · Seeker thread | [68:31120](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31120) |
| 768 · Seeker thread | [68:31204](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31204) |
| 1440 · Seeker thread | [68:31271](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31271) |
| 390 · Seeker inbox · Empty | [68:31338](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31338) |
| 768 · Seeker inbox · Empty | [68:31405](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31405) |
| 1440 · Seeker inbox · Empty | [68:31455](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31455) |
| 390 · Seeker inbox · Offline | [68:31505](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31505) |
| 768 · Seeker inbox · Offline | [68:31572](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31572) |
| 1440 · Seeker inbox · Offline | [68:31622](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31622) |
| 390 · Seeker inbox · Error | [68:31672](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31672) |
| 768 · Seeker inbox · Error | [68:31739](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31739) |
| 1440 · Seeker inbox · Error | [68:31789](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=68-31789) |

## Gaps

- There is no `text-16/regular` style. Body copy uses Figtree Regular with the `text/16` size and line-height variables. This page does not add a style on page 00.
- Category hues stay on page 00. These screens use the neutral badge, not a category fill, so a stage does not look like a status color. Separating the category hues is issue #85.
- The shared Sidebar still contains Promote. It is hidden on these frames. The plan line is monthly or annual only. There is no add-on purchase. The sidebar component was not edited.
- JobCard has no slots for a free bunkhouse, couples, meals, or a confirmed-active date. Those facts are lines on the ranch job and the apply screen.
- Dark mode is drawn on five 390 frames: Host home, Pipeline, Inbox, Profile, and Apply. The other frames bind the same Color variables.
- The seeker desktop account menu is the system control. The profile names Maya Reyes. The menu was not detached.
- A first-time seeker who still has to write a headline, experience, and availability does that on the profile and resume before the 3-tap apply. Page 02 keeps the account steps.
- The visa screen is the branch where the seeker has said they need a visa. Maya's main profile says she can work without one.
- Host pages at 768 and 1440 are as tall as the sidebar when the content is shorter. The content is not clipped.
