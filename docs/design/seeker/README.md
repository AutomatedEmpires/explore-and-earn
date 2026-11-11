# Seeker screens

Issue [#63](https://github.com/AutomatedEmpires/explore-and-earn/issues/63). Figma only. No UI code.

- **File:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A
- **Page 02 Seeker:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=39-2627
- **Frames:** 99. Each link below opens that frame.
- **Built from:** page 00 System components and variables. Colors are bound to the Color collection. Text uses the existing text styles. Body copy is `text-16/semibold` because the system has no `text-16/regular`.

The guest bar is top bar option A: wordmark, Community, and Sign in. Inbox and Notifications appear after sign-in. Phone frames use the seeker bottom tabs. 768 and 1440 turn on the desktop links and drop the bottom tabs.

The same four listings are used everywhere. Counts come only from those listings.

| Job | Where | Pay | Housing | Meals | Couples | Freshness |
|---|---|---|---|---|---|---|
| Lodge housekeeper, Kettle Ridge Lodge | Whitefish, MT | $22 an hour | Cabin, $12 a night | Included | Couples can share a cabin | Confirmed active 2 days ago |
| Deckhand, Harbor and Co | Sitka, AK | $280 a day | Bunk on the boat, included | Included | One bunk, no couples | Confirmed active 6 days ago |
| Ranch hand, Red Creek Ranch | Sheridan, WY | $18 an hour | Bunkhouse, free | No meals | Couples housed | Confirmed active 1 day ago |
| Bookkeeper, Northline Outfitters | Remote, host in Bozeman, MT | $28 an hour | No housing | No meals | Work from the US | Confirmed active 4 days ago |

Montana has 2 open jobs, Alaska 1, Wyoming 1. Every other state has 0. Remote work is counted in the host's state.

## Tap counts

Notes on the page sit outside the screens. They are not product copy.

| Flow | Taps | Path |
|---|---|---|
| A. A guest lands on a listing | 0 after the link | Detail · guest. Pay, dates, housing and its cost, meals, couples, and freshness are in the first view. The 390 frame is 673 px tall, under a 844 px phone. |
| B. First application | 6 | Apply, Continue with Google, confirm you are 18, continue, answer the start date, Send application. Sign-up returns to this job with the apply step open. |
| B. Returning seeker | 3 | Open the job, Apply, Send application. |
| E. Alert to application | 3 | View job, Apply, Send application. |

Every application screen shows the status, the host's usual reply time, and "You never pay to get a job." The apply step says "Saved on this phone."

## Prototype

Figma only navigates between top-level frames. The screens inside the boards cannot be link targets, so the 390 flow is copied to top-level frames named `Prototype · …`. Those copies are the links.

Starting points: Flow A guest listing, Flow B returning seeker, Flow E alert to application.

| From | Control | To |
|---|---|---|
| Prototype · Detail · guest · 390 | Apply | Prototype · Account · bridge · 390 |
| Prototype · Account · bridge · 390 | Continue with Google | Prototype · Apply · ready · 390 |
| Prototype · Apply · ready · 390 | Send application | Prototype · Apply · sent · 390 |
| Prototype · Alert · match · 390 | View job | Prototype · Detail · signed-in · 390 |
| Prototype · Detail · signed-in · 390 | Apply | Prototype · Apply · ready · 390 |
| Prototype · Apply · sent · 390 | View application | Prototype · Application · status · 390 |
| Prototype · Apply · error · 390 | Try again | Prototype · Apply · ready · 390 |
| Prototype · Apply · offline · 390 | Try again | Prototype · Apply · ready · 390 |
| Prototype · Browse · states · 390 | Montana | Prototype · Jobs · montana · 390 |
| Prototype · Browse · states · 390 | Alaska | Prototype · Jobs · alaska · 390 |
| Prototype · Browse · states · 390 | Wyoming | Prototype · Jobs · wyoming · 390 |
| Prototype · Browse · states · 390 | Idaho | Prototype · Jobs · idaho · 390 |
| Prototype · Jobs · montana · 390 | Apply | Prototype · Account · bridge · 390 |

## Frames

Prefix every id with `https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=`.

### Seek

Guest feed. Four jobs. Apply on a card is the secondary button, still active.

| Frame | Node |
|---|---|
| Seek · results · 390 | [42-2631](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2631) |
| Seek · results · 768 | [42-3032](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3032) |
| Seek · results · 1440 | [42-3412](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3412) |
| Seek · empty · 390 | [42-3793](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3793) |
| Seek · empty · 768 | [42-3878](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3878) |
| Seek · empty · 1440 | [42-3942](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3942) |
| Seek · error · 390 | [42-4007](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4007) |
| Seek · error · 768 | [42-4091](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4091) |
| Seek · error · 1440 | [42-4154](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4154) |
| Seek · offline · 390 | [42-4218](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4218) |
| Seek · offline · 768 | [42-4302](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4302) |
| Seek · offline · 1440 | [42-4365](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4365) |
| Seek · loading · 390 | [42-4429](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4429) |
| Seek · loading · 768 | [42-4517](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4517) |
| Seek · loading · 1440 | [42-4584](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4584) |

### Swipe

| Frame | Node |
|---|---|
| Swipe · card · 390 | [45-6079](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6079) |
| Swipe · card · 768 | [45-6205](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6205) |
| Swipe · card · 1440 | [45-6310](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6310) |
| Swipe · undo · 390 | [45-6416](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6416) |
| Swipe · undo · 768 | [45-6551](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6551) |
| Swipe · undo · 1440 | [45-6665](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6665) |
| Swipe · empty · 390 | [45-6780](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6780) |
| Swipe · empty · 768 | [45-6838](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6838) |
| Swipe · empty · 1440 | [45-6875](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6875) |
| Swipe · offline · 390 | [45-6913](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6913) |
| Swipe · offline · 768 | [45-6970](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6970) |
| Swipe · offline · 1440 | [45-7006](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7006) |

### Map

Host towns, then the Whitefish host preview. Remote work is pinned at Bozeman.

| Frame | Node |
|---|---|
| Map · preview · 390 | [45-7043](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7043) |
| Map · preview · 768 | [45-7120](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7120) |
| Map · preview · 1440 | [45-7176](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7176) |
| Map · empty · 390 | [45-7233](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7233) |
| Map · empty · 768 | [45-7291](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7291) |
| Map · empty · 1440 | [45-7328](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7328) |
| Map · offline · 390 | [45-7366](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7366) |
| Map · offline · 768 | [45-7423](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7423) |
| Map · offline · 1440 | [45-7459](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7459) |

### Listing and apply

| Frame | Node |
|---|---|
| Detail · guest · 390 | [45-7496](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7496) |
| Detail · guest · 768 | [45-7566](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7566) |
| Detail · guest · 1440 | [45-7615](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7615) |
| Detail · guest · 390 · dark | [45-9597](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-9597) |
| Detail · signed-in · 390 | [45-7665](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7665) |
| Detail · signed-in · 768 | [45-7735](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7735) |
| Detail · signed-in · 1440 | [45-7784](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7784) |
| Account · bridge · 390 | [45-7834](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7834) |
| Account · bridge · 768 | [45-7886](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7886) |
| Account · bridge · 1440 | [45-7917](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7917) |
| Alert · match · 390 | [45-7949](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7949) |
| Alert · match · 768 | [45-8002](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8002) |
| Alert · match · 1440 | [45-8034](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8034) |
| Apply · ready · 390 | [45-8067](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8067) |
| Apply · ready · 768 | [45-8125](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8125) |
| Apply · ready · 1440 | [45-8162](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8162) |
| Apply · sent · 390 | [45-8200](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8200) |
| Apply · sent · 768 | [45-8256](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8256) |
| Apply · sent · 1440 | [45-8291](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8291) |
| Apply · error · 390 | [45-8327](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8327) |
| Apply · error · 768 | [45-8384](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8384) |
| Apply · error · 1440 | [45-8420](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8420) |
| Apply · offline · 390 | [45-8457](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8457) |
| Apply · offline · 768 | [45-8514](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8514) |
| Apply · offline · 1440 | [45-8550](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8550) |
| Application · status · 390 | [45-8587](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8587) |
| Application · status · 768 | [45-8644](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8644) |
| Application · status · 1440 | [45-8680](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8680) |

### Browse by State and /jobs/[state]

| Frame | Node |
|---|---|
| Browse · states · 390 | [46-8604](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8604) |
| Browse · states · 768 | [46-8697](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8697) |
| Browse · states · 1440 | [46-8769](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8769) |
| Browse · offline · 390 | [46-8842](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8842) |
| Browse · offline · 768 | [46-8899](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8899) |
| Browse · offline · 1440 | [46-8935](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8935) |
| Jobs · montana · 390 | [46-8972](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8972) |
| Jobs · montana · 768 | [46-9051](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9051) |
| Jobs · montana · 1440 | [46-9109](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9109) |
| Jobs · alaska · 390 | [46-9168](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9168) |
| Jobs · alaska · 768 | [46-9232](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9232) |
| Jobs · alaska · 1440 | [46-9275](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9275) |
| Jobs · wyoming · 390 | [46-9319](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9319) |
| Jobs · wyoming · 768 | [46-9383](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9383) |
| Jobs · wyoming · 1440 | [46-9426](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9426) |
| Jobs · idaho · 390 | [46-9470](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9470) |
| Jobs · idaho · 768 | [46-9529](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9529) |
| Jobs · idaho · 1440 | [46-9567](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9567) |
| Jobs · offline · 390 | [46-9606](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9606) |
| Jobs · offline · 768 | [46-9663](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9663) |
| Jobs · offline · 1440 | [46-9699](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9699) |

### Prototype copies

| Frame | Node |
|---|---|
| Prototype · Detail · guest · 390 | [46-20525](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20525) |
| Prototype · Account · bridge · 390 | [46-20592](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20592) |
| Prototype · Apply · ready · 390 | [46-20641](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20641) |
| Prototype · Apply · sent · 390 | [46-20708](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20708) |
| Prototype · Alert · match · 390 | [46-20773](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20773) |
| Prototype · Detail · signed-in · 390 | [46-20835](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20835) |
| Prototype · Application · status · 390 | [46-20914](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20914) |
| Prototype · Apply · error · 390 | [46-20980](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20980) |
| Prototype · Apply · offline · 390 | [46-21046](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-21046) |
| Prototype · Browse · states · 390 | [46-21112](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-21112) |
| Prototype · Jobs · montana · 390 | [46-21203](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-21203) |
| Prototype · Jobs · alaska · 390 | [46-21279](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-21279) |
| Prototype · Jobs · wyoming · 390 | [46-21340](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-21340) |
| Prototype · Jobs · idaho · 390 | [46-21401](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-21401) |

## Gaps

1. **Category hues.** Screens use CategoryBadge and the Color variables as they are on page 00. Separating those hues from status colors is issue #85. This page does not invent new hex values.
2. **No 16 px regular text style.** Body copy uses `text-16/semibold`. The system scale still has the old in-between sizes. This page does not add styles on page 00.
3. **JobCard has no couples or freshness slot.** Those facts are lines under the card on Seek and Swipe, and they are first-class lines on the listing. Housing cost is written into the housing chip (`$12/night`) so it is not clipped.
4. **Map is a town list plus a host preview.** Page 00 has no map component. Pins are 44 px town buttons. Remote is Bozeman, the host's town.
5. **Browse by State is a button list, not a 50-state outline.** A path map cannot keep 44 px targets at 390 px. Counts are the four listings. Idaho is the drawn empty state. The other zero states on the list are active buttons and do not each have their own empty frame. A later frame can reuse the Idaho page and swap the state name.
6. **Desktop link current state is not exposed on TopBar.** Phone tabs are set: Seek, Swipe, or Map.
7. **Dark mode is drawn for the guest listing at 390.** The other screens use the same bound variables, so they follow Light and Dark, but only that one frame is switched to Dark.
8. **The Input component's empty hint is an email address.** Search fields override that text to "Jobs, places, or employers" or "Type a state". The component on page 00 is unchanged.
9. **Age confirmation and the Google button are one screen, not a captured Clerk card.** The bridge says the account is free and that the person returns to the same job. The live Clerk card is still the one on page 00.
10. **Plan billing is not on these screens.** Seekers do not pay. Host monthly and annual plans stay on the host work.
