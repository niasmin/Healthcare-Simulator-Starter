# Healthcare Empire: Care & Beyond — เฮลท์แคร์ เอ็มไพร์

A Thai-first, single-player isometric nursing home and hospital management simulator, built in TypeScript, React, Vite, Zustand, Tailwind and PixiJS.
Specs: [`GDD.md`](GDD.md) · Coding rules: [`CLAUDE.md`](CLAUDE.md)

> All prices, costs and stats are **fictional game-balancing values**. The game has no real patient data and makes no clinical recommendations.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest simulation rule tests
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
```

Add `?debug` to the URL to expose `window.__HE__` (store + renderer) for automated browser tests.

## Deploy (GitHub Pages, Cloudflare Pages, Supabase cloud saves)

Every push to `phase-0-1-playable` runs `.github/workflows/deploy.yml`. Pull requests run the tests only. The workflow:
1. typechecks and runs the tests;
2. builds once;
3. publishes the same `dist/` to GitHub Pages and Cloudflare Pages.

One-time setup:
- **GitHub Pages:** in the repository's Settings → Pages, set *Source* to **GitHub Actions**. The site is then served at `https://niasmin.github.io/Healthcare-Simulator-Starter/`. The build uses relative paths, so it works under that sub-path.
- **Cloudflare Pages:** add two repository secrets, `CLOUDFLARE_API_TOKEN` (a token with *Cloudflare Pages: Edit*) and `CLOUDFLARE_ACCOUNT_ID`. The workflow creates the `healthcare-empire` Pages project on first run, then deploys to `https://healthcare-empire.pages.dev`. Without the secrets this job is skipped with a notice.
- **Supabase (cloud saves):** the deployed site saves to the project's `public.game_saves` table.
  - The table has one row per player and slot, own-row RLS policies and a 256 KiB check per row. `CloudStore` splits big saves into 200,000-character parts, one row each.
  - **Player accounts:** players sign up or sign in with an email and password from the 👤 button on the title screen, the phone menu, or the Save window. They can reset a forgotten password by email, or change it while signed in. Signed-in players' saves follow them to every device.
  - **Guests:** players can also play without signing in. Their saves stay in that browser. No account is made automatically anymore (earlier builds made an anonymous one per browser).
  - **Email confirmation:** if the project requires it (Auth → Providers → Email → *Confirm email*), a new player confirms by email, then signs in. Supabase's built-in mailer sends only a few emails an hour, so a real launch should set custom SMTP in Auth → Emails.
  - The project URL and publishable key are in `.env.production`. The publishable key is meant to be public; RLS protects the rows.
  - In Supabase Auth → URL Configuration, add the two site URLs above as redirect URLs so the email links come back to the game.
  - Inside the Claude artifact, the artifact's own per-person storage is used instead.
  - Play statistics come from signed-in players only. Guests have no account, so nothing is sent for them.

### Launch polish

- **Faster start:** the map renderer (Pixi, about 570 KB) is a separate chunk, loaded with the map. The title screen and menus don't wait for it, and the title screen is ready in under a second on a local preview.
- **Sound:** small effects synthesized with WebAudio, so there are no audio files to download. They play for building, hiring and admissions, payments, events, chapter wins and losses, and refused actions. There is also an optional soft music loop.
  - Effects are on by default and music is off; both are remembered per browser.
  - Toggles live in Settings (title screen), the phone menu, and 🔊 in the desktop top bar.
  - Nothing plays before the first tap, or while time away is being caught up.
- **Installable app (PWA):** a web manifest, app icons (the nurse character on the game's teal) and a service worker.
  - The page is network-first, so a new deploy shows up at once. Hashed build files are cache-first, so the installed app opens offline.
  - The worker is registered only on the deployed HTTPS site, never in development or inside the Claude artifact.
- **Share preview:** Open Graph and Twitter tags with a 1200×630 image (the key art with the logo).
- **Anonymous play statistics** (on by default, can be switched off in Settings):
  - The site records games started, tutorial steps reached, chapter verdicts with the targets missed, autopilot switches, and a ping every 5 minutes of play (chapter and day).
  - Events go in batches to Supabase's `public.game_events`. Players can insert only their own rows and nobody can read them through the API; the owner reads them in the dashboard.
  - No names, emails or game content are stored.
  - Nothing is sent from the Claude artifact.

## Milestone status

| Phase | Scope | Status |
|---|---|---|
| **0** | Scaffold, data models, deterministic engine, tests | ✅ Done |
| **1** | 20×20 isometric map, room building and validation, camera | ✅ Done (first playable build) |
| **2** | Residents, staff, needs, care plans, care tasks, role × shift roster | ✅ Done |
| **3** | Pricing, monthly invoices and payments, running costs, Financial Dashboard, 4 events, title screen, character portraits | ✅ Done |
| **4** | Save/load, guided tutorial, 30-day chapter goal with win/lose verdict, three scripted events, balancing | ✅ Done (**MVP complete**) |
| **5** | Chapter campaign; Ch. 2 nursing center with specialised programmes; Ch. 3 premium villas (Tranquila); Ch. 4 Home Care | ✅ Done |
| 6 | Ch. 5 workforce (training + B2B placements), Ch. 6 neuro hospital (OPD + stroke unit), Ch. 7 branch network | ✅ Done (all 7 chapters playable) |

## What you can play now

Playable today, as one 390-day campaign with the same business:

| Chapter | Days |
|---|---|
| 1. First Care Home | 1–30 |
| 2. Professional Nursing Center | 31–90 |
| 3. Tranquila Senior Living | 91–150 |
| 4. Home Care | 151–210 |
| 5. Healthcare Workforce | 211–270 |
| 6. Neuro Hospital | 271–330 |
| 7. Healthcare Empire (branch network) | 331–390 |

After chapter 7 the game continues as a sandbox.

### Shop: permanent upgrades

The shop (the floating Shop button on the phone map, 🛒 in the desktop top bar, and a browse-only list on the title screen) sells permanent upgrades for the home. Each is paid once with game cash and has one mechanical effect. There is no premium currency and no real-money purchase. Prices are fictional.

| Upgrade | Price | From chapter | Effect |
|---|---|---|---|
| 📣 Online marketing | ฿150,000 | 1 | +1 family enquiry a day |
| 💝 Staff welfare | ฿200,000 | 1 | +1 morale a day for every employee |
| 🍲 Central kitchen | ฿250,000 | 1 | Food costs −25% |
| 📱 Family app | ฿180,000 | 2 | +0.2 reputation a day while satisfaction is 60+ |
| 📦 Supply stock system | ฿300,000 | 2 | Daily supplies −20% |
| 🔔 Smart call system | ฿350,000 | 3 | Routine care may start 30 minutes later before it counts as missed |

The sandbox can buy everything from day 1. The scripted player never buys upgrades, so the campaign balance figures are unchanged.

**Art** (from the characters, rooms and equipment sheet):
- **Doctor:** the neurologist has their own portrait and map figure, cut from the sheet with OpenCV GrabCut. The sheet has one expression, so all five moods use it.
- **Rooms:** the ward, villa, therapy room, neuro clinic, stroke unit (the recovery room picture) and training room (the activity room picture) use the sheet's isometric rooms in the build list.
- **Equipment:** the examination desk, waiting chairs, vital-signs monitor, training manikin and whiteboard get map sprites cut from the sheet's equipment row.
- **Branches:** the Network tab uses the business-card art from the title key art.
- **Support staff:** the pharmacist, nutritionist, cleaner, receptionist and security guard have portraits, map figures and build-list art (pharmacy, dining hall, laundry, storage, bath & hygiene, reception desk) from the sheet; the medicine shelf, dining table and reception desk have map sprites.
- **Map sprites drawn for this game:**
  - The storage rack is cut from the sheet's storage room.
  - The washer and bath set are drawn to match, since the sheet has no clean single copy of either.
- **Not used yet:** the outdoor activity area and some furniture.

### Support rooms and staff (optional)

Six optional support rooms can be built (the pharmacy from chapter 2, the rest from day 1). Staffed rooms unlock their support roles on the job board, and an applicant of a role only appears once its room exists. They are optional: the campaign can be won without them, and the scripted player never builds them.

| Room | Equipment | Staff | Effect (while the room is open and someone of that role has a shift) |
|---|---|---|---|
| Pharmacy (2×2) | Medicine shelf | Pharmacist (med rounds) | Daily supplies cost 90% |
| Dining room (3×3) | Dining table | Nutritionist (meals) | Residents who eat on their own get +10 nutrition and +2 happiness at meal times (the room alone is enough); with a nutritionist, family satisfaction +0.5 a day |
| Laundry room (2×2) | Washer | Cleaner (cleaning) | Daily upkeep cost 80%; residents' happiness +1 a day |
| Reception (3×2) | Reception desk (+ up to 2 waiting chairs) | Receptionist (front desk) | +1 family enquiry a day |
| | | Security guard | Family satisfaction +0.3 a day |
| Storage room (2×2) | Storage rack | none | Daily supplies cost 95% (on top of the pharmacy and the shop's supply stock system) |
| Bath & hygiene (2×2) | Bath set (shower chair, grab rails) | none | Personal care takes a third less time (30 → 20 min) |

Support staff only do their own skill, and they never count as the "narrowest" colleague when nurses and caregivers decide whether to hold back for a task only they can do. Values are fictional game balancing.

### Autopilot: let the home run itself

The 🤖 Autopilot button (top bar; a floating button on the phone map) opens fifteen switches in four groups, plus two settings for when you are away. Everything they do goes through the same public commands a player uses, so every rule and invariant still holds. All are off by default, and the scripted player never uses them.

| Group | Switch | What it does |
|---|---|---|
| Daily running | Answer events and staff requests | Answers each event at once without pausing, using the first possible choice from a preference list: accept a staff pay request (the raise), the standard family visit, an urgent RN assessment, referrals for the beds you have |
| | Admit residents | Every game hour, fills each fitting free bed from the waiting list (urgent referrals first, then a chapter programme nobody is in yet), plus stroke-unit referrals |
| | Write care plans | Every resident without a care plan gets one (needs an RN on the staff) |
| | Look after tired or unhappy staff | Every morning at 05:00, anyone on a double shift with energy under 30 or morale under 50 gets the second shift off (the hire switch finds cover). A home without a staff room gets one |
| | Hire as needed and roster | Fills each gap in the roster advice with someone who has no shift yet, or hires an applicant. This covers a missing RN or skill on a shift too. It never hires into debt, never dismisses anyone, and never rosters staff held for training or placements |
| Growth | Build ready-made rooms | At most one room a day, at 08:00:<br>• a missing basic room (ward, nursing station, staff room, therapy);<br>• another 10-bed ward when every bed is taken and 3+ families wait;<br>• a villa for waiting premium families;<br>• by chapter: the specialised ward fittings, 30 beds and the RN team (ch. 2), the clinic and stroke unit (ch. 6).<br>Rooms go next to an existing corridor, as near the entrance as they fit and open, and only while running costs plus a reserve stay in the bank |
| | Garden and decor from chapter 1 | Up to 3 garden items a turn around the wards (never next to a corridor, so room spots stay free) until appeal reaches 30, keeping a ฿300,000 reserve |
| | Price to demand | Every morning at 06:00, it picks a price level:<br>• **value** while over 25% of beds are free (more enquiries);<br>• **premium** when the home is full, 6+ families wait, satisfaction is 75+ and reputation 60+, and the chapter's resident and programme targets are met (premium cuts enquiries);<br>• **standard** otherwise.<br>Bills already issued keep their price |
| | Land, villas and garden | From chapter 3: villas and a garden up to full appeal. When the lot is full it buys the next plot and runs a corridor into it |
| | Buy shop upgrades | Buys the cheapest unlocked upgrade once the home has 30 beds, while 30 days of running costs plus a ฿500,000 reserve stay in the bank (growth first: upgrades bought early starved the chapter 2 expansion) |
| Business lines | Home Care | From chapter 4: the Home Care centre, a van for every four clients, and new clients the vans can serve |
| | Send staff to training | From chapter 5: the training room, certificates up to the chapter target, and people prepared for placements that need a certificate |
| | Place staff with partners | From chapter 5: accepts offers from factories, clinics and partner organisations with a suitable person, soonest expiry first, at most 4 contracts at once. It builds the training room partners require |
| | Run branches | Chapter 7: one branch of each kind with a newly hired manager, replacement managers, and support visits when a branch drops below 72 quality |
| Campaign | Play every chapter | Switches on every growth, business and staff-care helper with it (shown as covered in the window) and works through each chapter. A won chapter leads straight into the next at the same speed; a failed one is played again |

The autopilot never dismisses anyone.

**Alert me about important things** (a setting, on by default):
- Fires when cash covers less than 14 days of running costs, or the game pauses for a decision.
- On screen, low cash shows a toast; a pause already shows its own card.
- In another tab, it marks the tab title and sends a browser notification if allowed.
- Each alert fires once when its condition starts.

**While you are away** (a setting in the same window, on by default, remembered per browser):
- With at least one switch on, time spent away is played out at the speed the game was running when you come back. That covers another tab, a sleeping screen, or a closed game reopened with Continue.
- At most 30 game days are played out, one game day per chunk so the page stays responsive. A progress banner shows meanwhile, and a "While you were away" card sums up the change in cash and residents and any chapters won.
- It stops early if the game pauses itself, for example for an event the autopilot leaves to the player or at the end of the campaign.
- The game loop runs from the app root, so moving between the map, roster, residents and finance views never stops the game.

Results:
- **Built 10-bed home, the four daily switches:** it fills up, keeps about 98% or more of care done and stays profitable for 60 days on every seed tested.
- **Starter campus, daily switches plus room building:** it builds three wards and the therapy room, reaches 30 residents and wins chapter 1 on its own. Over 90 days on seeds 1, 3 and 8, cash never fell below ฿440,000.
- **"Play every chapter" with the four daily switches and room building, 390 days with no input:**
  - Seed 3 wins all seven chapters.
  - Seed 1 wins chapters 1–6 and loses chapter 7.
  - Seed 8 loses chapter 2 once, plays it again and wins chapters 2–6.
  - Cash stays positive throughout and the ledger reconciles on every seed.
  - No single tick takes more than about 40 ms.
- **The four daily switches plus "Play every chapter", 390 days with no input:**
  - Seeds 1, 3 and 8 all win all seven chapters on schedule.
  - They buy all six upgrades and reach full garden appeal and reputation 100.
  - The ledger reconciles on every seed.
  - Two fixes got there:
    - Chapter 2's specialised fittings go into another ward while a programme still has nobody and no fitted bed is free.
    - The land purchase counts as the day's spend, so a room waits until the money is back. Before that fix, seed 8 went bankrupt on day 151.

### More land

The plots down the street are sold one after another. Each grows the lot east, and everything already built stays where it is.

| Plot | Lot size | Price | From chapter |
|---|---|---|---|
| 1 | 32×20 | ฿300,000 | 3 |
| 2 | 44×20 | ฿500,000 | 4 |
| 3 | 56×20 | ฿800,000 | 5 |

### Exterior view

The 🏠 button on the map switches to an exterior view: every room is drawn as a finished building seen from above, with cream walls, windows, its front door and a roof. Homes (ward, villa, staff room, dining room) get pitched tile roofs; clinical and service rooms get flat roofs with rooftop units and a coloured sign band. People and interiors are hidden in this view. Press it again to look inside.

### Game modes: campaign, challenge and sandbox

The mode tabs on the title screen now work, and New Game starts the chosen mode. Every mode uses the same engine and rules; only the opening differs.

- **Campaign:** the 7-chapter story from Chapter 1, as before. Older saves count as campaign games.
- **Sandbox:** free play with ฿50,000,000 (booked as capital, so the ledger still reconciles) and every room and service unlocked from day 1. There are no tutorial steps and no verdicts, and two neurologists are among the applicants. Residents still need good care: reputation, turnover and refunds work as normal.
- **Challenge:** one chapter, judged as usual, under harder opening conditions. Winning ends the challenge, so there is no follow-on chapter, and "play again" restarts the same challenge.

  | Challenge | Judged as | Opening |
  |---|---|---|
  | 💸 Tight budget | Chapter 1 | ฿1,150,000 instead of ฿2,000,000 |
  | 📰 Rebuild the name | Chapter 1 | Reputation 18: few enquiries, and waiting families drift away until care wins trust back |
  | 🏗 Big from day one | Chapter 2 | ฿4,000,000; the programme candidates are on the waiting list from the start |

  The scripted careful player wins each challenge on 3 seeds. Tight budget is genuinely tight (lowest cash about ฿37k–46k).

### Phase 6, part 3: Chapter 7 (Healthcare Empire, the branch network)

- **Branches** are run from headquarters at portfolio level (capacity, occupancy, quality), not as separate maps. A new **Network** tab is the multi-site dashboard. All figures are fictional.

  | Branch | Opening cost | Capacity | Revenue | Running cost | Manager |
  |---|---|---|---|---|---|
  | Nursing home | ฿1.8M | 20 beds | ฿1,200 per bed-day | ฿6,000/day + ฿450 per bed-day | RN |
  | Home Care | ฿600k | 15 clients | ฿950 per client-day | ฿2,500/day + ฿350 per client-day | PN or RN |
  | Neuro clinic | ฿1.2M | 30 visits/day | ฿1,000 per visit | ฿9,000/day + ฿200 per visit | Doctor |

  At most 5 branches.
- **Manager:** every branch needs one, moved from headquarters' staff. The manager leaves the roster for good: no shifts, no courses, no placements. If the manager leaves the company, the branch is leaderless until a new one is appointed.
- **Quality** moves 20% of the gap toward a target each day.
  - The target starts at 55: +10 for a certified manager, +5 for a manager with good morale, +5 for a training room at headquarters, +5 for a reputation of 80+. A branch without a manager targets 30.
  - A **support visit** (฿50,000) adds +10 at once, at most once every 7 days.
- **Occupancy:** a branch grows by 8% of its capacity a day while its quality is 60+ and headquarters' reputation is 50+. It shrinks by 5% a day while quality is below 50.
- **Billing:** each branch bills its day on a `branch` invoice and pays its running costs at midnight.
- **Clinic referrals:** a full clinic branch refers a patient to headquarters' stroke unit on about 30% of days.
- **Closing** a branch refunds 30% of its opening cost and frees the manager.
- **Targets:** 60 days; 3 branches of all 3 kinds; average branch quality of 70; network occupancy of 70%; headquarters stays at 36 beds / 30 residents, quality 75 and a profit. Winning chapter 7 completes the road map.
- **Balance fixes from the merge with main's care consequences:**
  - Home visits are now booked 09:00–13:10, after the breakfast rush, instead of 08:00–13:00.
  - A visit no longer takes a nurse away while nurse-only care is due, unless the visit is about to be missed.
  - The staffing advice adds a deadline check, so a long task (a home visit) can no longer hide a short rush.
  - Together these cut missed care in a large campus from about 70 to about 15 tasks a day, so reputation holds.
  - The scripted player wins all 7 chapters on 3 of 4 seeds. On the fourth it misses chapter 3's premium target (3 of 4) because families now and then leave.
- Save schema 10 (a v9 save gains an empty network).

### Phase 6, part 2: Chapter 6 (Neuro Hospital)

All hospital work is abstract: a consultation, a nursing round and a doctor's round, each tied to the qualification it needs. None of it is medical advice, and all fees are fictional.

- **Neurologist** (new role; ฿75,000/month + ฿2,500 per year of experience; qualification "consultation").
  - Doctors do only doctors' work, never general care.
  - Two apply when the chapter opens, and from then on one is always in the applicant pool.
  - Portrait and map figure from the characters sheet.
- **Neuro clinic (OPD)**, unlocks in chapter 6, ready-made 4×3 with 2 examination desks.
  - Bookings: each desk takes 6 appointments a day between 09:00 and 14:10 (only 4 while reputation is below 60). Bookings start the day after a doctor is on the staff.
  - Consultations: a free doctor on shift sees each patient at a free desk, 30 minutes each.
  - Missed appointments: patients wait 60 minutes past their time, then leave.
  - Billing: consultations go on one daily OPD invoice at ฿1,200 each.
- **Stroke unit (IPD)**, ready-made 4×3 with 6 beds, a call bell and a vital-signs monitor. Its beds do not count as home beds.
  - Referrals: about 1 in 5 consultations ends in a referral, which waits 2 days for a bed. A referral that finds no bed costs −0.5 reputation.
  - The stay: 5–8 days. Inpatients get a nursing round every 4 hours (PN/RN, nights included) and a doctor's round every morning.
  - Billing: ฿5,500 per day, invoiced at discharge, plus ฿600/day in supplies.
  - Outcome: more than 2 missed rounds makes the stay "complicated" (−1 reputation). Otherwise the patient goes home as planned (+0.5). Half of those families then ask for a place in the home's rehab ward, which adds a waiting-list candidate.
- **Roster** advice includes clinic bookings and rounds for every stroke-unit bed, with a Doctor row. Inpatients lie in their beds on the map, and doctors appear at the clinic or at the bedside.
- **Targets:** 60 days; 500 outpatients seen in the chapter; 90% of appointments seen over the last 7 days; 25 inpatients home as planned; the home stays at 36 beds / 30 residents, quality 75 and a profit. The scripted player wins on 3 seeds (708 consultations, about 49 smooth discharges).
- **Admit tab:** a hospital panel with today's clinic numbers, referrals with an Admit button, and inpatients with their day and rounds.
- Save schema 9 (a v8 save gains an empty hospital).

### Phase 6, part 1: Chapter 5 (Healthcare Workforce)

- **Training room** (unlocks in chapter 5, ready-made 2×3): one whiteboard plus training manikins. Each manikin is one seat in class.
- **Courses** (abstract qualifications, never clinical instruction; fictional prices):
  - *Advanced elder care* (caregivers, ฿6,000): a certificate.
  - *Tube-feeding care* (caregivers, ฿8,000): a certificate plus the tube-feeding qualification.
  - *Airway care* (practical nurses, ฿12,000): a certificate plus the airway-care qualification.
- **How class works:** a course is 8 hours, taken during the trainee's own shift, so the home is a pair of hands short while they learn. Staff without shifts attend 08:00–16:00. Trainees sit in the training room on the map, and passing adds +5 morale.
- **Partner requests:** clinics, hospitals, companies and schools (all fictional) send 1–2 requests a day once a training room exists. A request names the role, an optional certificate, 7/10/14 days and a daily rate (caregiver ฿1,100, PN ฿1,700, RN ฿2,600; +25% when a certificate is required). Requests stay open for 4 days, and at most 4 wait at once.
- **Placements:**
  - A placed employee leaves the home's roster. Their shifts are removed and new shifts are refused.
  - They work at the partner 07:00–15:00 on each contract day and are not drawn on the map then.
  - Each worked day is billed to the partner at midnight on a `b2b` invoice and paid like any other.
  - An exhausted employee misses the day.
  - A completed contract returns the employee and gives +1 reputation if no day was missed. Ending early, or losing the employee, gives −2.
- **Targets:** 60 days; 6 certified staff; 6 contracts completed; the home stays at 36 beds / 30 residents with quality 75 and a profit.
- The guide walks through the room, the first certificate, the first placement, the roster, then the two targets. The Hire tab has the whole workforce panel, and the roster shows 🎓 certificates and where placed staff are.
- Save schema 8 (a v7 save gains an empty workforce).

### Phone play screen in the concept-art style

- **HUD over the map:** a manager card (portrait, chapter and day, chapter progress bar; tap for the road map), a cash pill (its “+” opens Finance), the alerts bell and settings. A second row has the clock with pause/1×/2×/4× and residents/beds, satisfaction and reputation.
- **Mission card:** clipboard, “chapter · step”, the current goal and a progress bar. ▼ unfolds the hint and the “Show me” button. The gift opens the chapter road map (what the next chapter unlocks).
- **Floating buttons:** Missions (every step of the chapter with ticks and “Show me”), Events (the latest log entries), Rewards (chapter road map, with a “!” when the next chapter is ready) and Shop (the build sheet with ready-made rooms and garden decor). Bottom left, “Overview map” recenters the camera. Bottom right, the layers button hides or shows the room labels.
- **Room labels** are coloured pills with a glyph per room type (ward, nursing station, therapy, staff room, villa, home-care office). They stay readable when you zoom out.
- **Shortcut cards** above the tab bar: Build, Residents (with a head count) and Report (the dashboard).
- The concept's floor selector (1F–3F) and gem currency are not in the game. Buildings have one floor, and there is no premium currency.

### Title screen in the Healthcare Empire key-art style

- **Full-bleed key art** (cropped from the concept image) behind the Healthcare EMPIRE logo, tagline and a manager card. The card shows the current chapter and how many of the 7 road-map chapters are won, read from the latest save.
- **Status pills** for cash, residents and reputation come from the latest save's metadata. They show “–” when there is no save yet.
- **Big buttons:** Continue (disabled without a save), New Game (choose the starter campus or an empty lot) and My saves (save slots plus the real cloud-sync status). There is no fake log-in.
- **Side menus:** Missions opens the chapter road map, Guide opens a 6-step how-to-play, and News lists what is in this version. Shop and Ranking are shown locked (“coming soon”).
- **Mode tabs:** Campaign is playable. Challenge and Sandbox are locked.
- **Business cards** (Nursing Home, Tranquila, Home Care, Neuroclinic, Rehabilitation, Staff, Inventory, Management, Achievement) show the chapter that unlocks each one, or a lock when it isn't built yet. Tapping a card opens the road map.
- **Phone portrait layout (≤ 640 px wide)** follows the portrait concept art. The key art, with the baked-in buttons painted out, sits behind real controls:
  - a manager card, cash/residents/reputation pills and settings (language, My saves) at the top;
  - Missions, Events 🔒, Rewards and Shop 🔒 on the left, and News and Guide on the right;
  - big New Game and Continue buttons, the mode tabs and scrolling business cards at the bottom.
- Dialogs close with Esc or ✕.

### Play-screen upgrade: a living town, ready-made rooms and a starter campus

- **The map is a town now.** All of this is drawn by `render/WorldBackdrop.ts`, never the game's random generator, and nothing is saved:
  - Around the lot: lawns, a ring road with lane markings, houses and shophouses with pitched roofs, cherry and shade trees, and a pond.
  - A white fence marks the lot, with the gate left open.
  - Next door, the plot for sale has a dashed outline and a sign: "ขายที่ดิน · เปิดบทที่ 3" before chapter 3, then its price.
- **Camera:** on phones the lot fills the screen width; zooming out stops before the town's edge.
- **Time of day:** a soft tint follows the game clock (dawn glow, evening amber, blue night), and cars drive along the street while the game runs.
- **Ready-made rooms (ห้องสำเร็จรูป):** pick one, then tap or drag on the map to place it. You get the room and all its equipment in one command:
  - 10-bed ward, 15-bed ward, nursing station, therapy room and staff room.
  - Move-in villa (Chapter 3) and Home Care centre (Chapter 4).
  - Each costs exactly what building it by hand costs, goes through the same placement and equipment rules, and is all-or-nothing.
  - ⟳ (or R) rotates the room. Dragging on a phone moves the ghost footprint, and lifting your finger places it.
- **New game choice:** **ศูนย์เริ่มต้นสำเร็จรูป** (recommended) starts with a corridor spine, a ready nursing station and staff room, and plants at the gate, all paid from capital; **ที่ดินเปล่า** is the original empty lot.
- **Try a chapter again:** a failed chapter can be replayed with the same business (↻ on the result card and the tutorial card); its days count from the retry.
- **Less clutter:** the controls hint at the bottom of the map hides after 45 seconds. Placement previews still show there.

### Phase 5, part 2: Chapter 3 (Tranquila villas) and Chapter 4 (Home Care)

- **Chapter 3: Tranquila Senior Living** (60 days).
  - **Buy the neighbouring plot** (ซื้อที่ดินข้างเคียง, ฿300,000, from the Build tab). The lot grows from 20×20 to 32×20 to the east, and everything already built stays where it is.
  - **Private villa** (new room, 9–16 tiles): needs a bed, a call bell and a sofa, and houses one premium resident.
  - **Premium residents:** from Chapter 3, about 30% of new active-ageing and rehab candidates want a villa (marked ★), and three arrive the day the chapter opens. They take villa beds only, and pay ฿42,000 a month on top of their care fee.
  - **High expectations:** a premium resident's satisfaction slips every tick unless the garden is lovely. Garden appeal 20 breaks even, and up to 30 helps.
  - **Waiting-list turnover:** when the list is full, the longest-waiting candidate now leaves, so new families keep arriving (Chapter 3 onward).
  - **To win:** 4 premium residents in villas, their average satisfaction at least 78, garden appeal at least 20, at least 30 residents and 36 beds, an operating profit, quality at least 75, and cash never below zero.
- **Chapter 4: Home Care** (60 days).
  - **Home Care centre** (new room): needs a coordination desk and at least one **care van** (฿180,000, ฿300 a day to run).
  - **Clients:** enquiries arrive daily once the centre is open. Each accepted client gets one daily appointment between 09:00 and 13:10, after the breakfast rush; appointments are handed out so they spread over the morning.
  - **Visits:** a caregiver visit (personal care, ฿900) or a nurse visit (vital signs, ฿1,500) takes a qualified, on-shift employee and a free van out of the building for 100 minutes, travel included. Staff on a visit leave the map, and the staff table shows "🚐 out on a home visit".
  - **Rules and billing:** a visit not started within 90 minutes is missed. Each done visit adds 3 satisfaction and each missed one takes 15; below 35, the family cancels. Completed visits are billed per client at midnight.
  - **Staffing advice** now counts home visits in the morning shift.
  - **To win:** 12 clients, at least 90% of visits done over the last 7 days, at least 30 residents and 36 beds, an operating profit, quality at least 75, and cash never below zero.
  - **UI:** the Admit tab gains a Home Care section with enquiries, clients, the van count and the 7-day visit rate.
- **Balance** (scripted careful player across the 210-day campaign, 5 seeds):
  - Chapter 3 won on 4 of 5 seeds; one missed premium satisfaction at 75.
  - Chapter 4 won on all 4 seeds that reached it, with 100% of visits done.
  - In both chapters the lowest cash stays between ฿21k and ฿150k.
  - The scripted player spends on land, villas, the garden and vans only when the cash runway reaches the next billing day.
- **Save format:** schema 7 adds `homecare`. Older saves migrate automatically.

### Phase 5, part 1: the campaign and Chapter 2

- **Campaign:** winning a chapter offers **เริ่มบทที่ 2** on the result card, on the tutorial card and on the chapters screen. The next chapter starts that day with the same site, staff, residents and cash. Each chapter is judged once over its own days; earlier verdicts are kept in `chapter.past`.
- **Chapter 2: Professional Nursing Center** (60 days). To win:
  - 30 operational beds and at least 24 residents
  - at least 3 RNs
  - at least one resident in each specialised programme
  - an operating profit over the chapter's days
  - care quality of at least 75
  - cash never below zero
- **Specialised programmes** (the GDD roadmap's "dementia, tracheostomy, feeding and rehab as abstract care levels"). They are modelled only as kinds of work and who is qualified to do them, never as treatment:

  | Programme | Care level | Extra fee/month | What it needs |
  |---|---|---|---|
  | สมองเสื่อม (dementia) | 2–3 | ฿4,000 | A ward fitted with the new **door sensor system** (฿35,000). Three safety rounds a day; help at meals |
  | ให้อาหารทางสาย (tube feeding) | 3–4 | ฿6,000 | A ward with a **feeding pump** (฿12,000). Three tube feeds a day (RN or PN only), repositioning every 4 h, ฿40/day supplies |
  | เจาะคอ (tracheostomy) | 4 | ฿12,000 | A ward with a **feeding pump and a suction machine** (฿20,000). Airway care every 6 h (**RN only**, so an RN on nights too), tube feeds, repositioning, ฿90/day supplies |

  - Programme candidates join the waiting list from Chapter 2, one of each on its first day, and then at half the rate of the basic groups.
  - Other residents fill ordinary wards first, keeping secured beds free.
  - The waiting-list card shows each candidate's monthly fee and programme. Admit is disabled when no suitable bed is free.
- **Staffing advice v3:** an RN is added wherever RN-only work needs one, nights included. Caregiver work is now planned for caregivers alone, because in a real rush the nurses' time goes to nurse-only work. The more generous estimate under-staffed big homes; 30+ residents missed up to 13% of their care.
- **Task assignment:** a PN or RN holds back from routine personal care when their own specialist work would fall due before they finished it, unless the routine task is within 30 minutes of being missed. Before this, PNs took 07:30 personal care while the 08:00 vital-sign checks waited and were missed.
- **Balance** (scripted player, 7 seeds, room & care fees now ฿29k / ฿33k / ฿39k / ฿46k for levels 1–4):

  | Play | Result |
  |---|---|
  | Chapter 1, full home staffed to the advice | won on 6 of 7 seeds (−฿1k to +฿38k operating result) |
  | Chapter 1, stopping at 8 residents | won on 3 of 7 seeds |
  | Chapter 1, stopping at 6 residents | failed on 7 of 7 seeds |
  | Chapter 2, a careful builder: a 15-bed specialised ward, then a 12-bed ward, each only when the cash runway reaches billing day | won on 6 of 6 seeds that reached it; lowest cash ฿241k–฿385k |
  | Chapter 2, a reckless builder: each ward the moment it is affordable | lowest cash −฿60k to ฿40k; bankrupt on one of three seeds |
  | Chapter 2 plus a second full team | failed |

  A bigger home is very profitable once it is full: about ฿0.7–0.8M of operating profit over the 60 days. The danger is liquidity. Wages are paid every day, but the new residents' bills arrive at admission and on day 1 of each month.
- **Cash runway (เงินสดพอจ่าย):** a new dashboard tile shows how many days the cash covers at today's running costs (payroll, upkeep, food and supplies). It turns red with a warning when the cash would run out before the next billing day.
- **Save format:** schema 6 stores `chapter = { id, startDay, result, past }`. Schema-5 saves migrate automatically, keeping their Chapter 1 verdict, and staff hired earlier learn the new skills of their role.

#### Character and equipment art from the project's new sheets

- **Characters:** the chibi character sheet (7 roles, front/side/back views and 5 expressions each) was cut with flood-fill background removal into 7 full-body sprites and 35 expression faces, about 200 KB of WebP.
  - **On the map**, staff on shift are drawn as full-body characters standing on a role-coloured ring. RN and PN share the nurse uniform, and the ring tells them apart.
  - **Portraits follow the person's live mood.** Residents use the average of happiness and satisfaction: happy at 80+, smile at 65+, default at 45+, otherwise sad. Staff use morale, and look sad when exhausted. Event cards show surprise for an urgent change and sad for a resignation.
  - Male residents use the new elder; female residents keep the earlier portraits until there is a female elder in the sheet.
- **Equipment:** the feeding pump, suction machine and sofa were cut from the equipment sheet. The pump and suction machine are new ward fittings for the tube-feeding and tracheostomy programmes (above), and the sofa is the staff-room rest sofa. Residents outside a programme fill ordinary wards first, keeping specialised beds free.

#### Ideas taken from CMNH-ENTERPRISE (V11–V18)

The attached project is a separate, simpler engine (one counter per centre, V4–V10 upgrades and illustrated or 3D scenes), so none of its code was imported. These approaches were adopted:

- **Requirement cards per chapter** (its `v15-phases.js`): every road-map card now lists its real targets (days, beds, residents, RNs, programmes, profit and quality), all derived from game data. Done, current, ready-to-start and locked chapters each get their own badge.
- **Derived progress, no second store:** it computed milestones from game state rather than saving progress flags. The tutorial already did this, and it now covers both chapters.
- **Its own bug notes as a checklist:** rejecting actions with zero residents, affordability checks that match the charge, and no fabricated counts on the map. All three already hold here and are covered by tests.
- **Kept for later:** walking nurses and a Full/Reduced/Off motion setting (`v16-animation.js`), and the Home Care, villa and hospital building ideas for Chapters 3, 4 and 6. Its Supabase cloud save isn't needed, because saves already sync through the page's own storage.

### Phase 4, part 2: tutorial, the 30-day goal and balancing

- **Guided tutorial (คู่มือ):** a card over the map shows the current step of Chapter 1 (14 steps), why it matters and how to do it, plus a **พาไปทำ / Show me** button that opens the right tool, tab, room or view.
  - Steps: corridor → ward → 10 beds → nursing station → therapy room → staff room → hire an RN → admit → care plans → roster → start the clock → 8 residents → first payment → finish 30 days in profit.
  - Steps are derived from the game state (no stored flags), so the guide is always in sync, even after loading a save or doing steps out of order.
  - A toast confirms each finished step. "ซ่อนคู่มือ" folds the card into a small chip; the choice is remembered per browser.
  - On phones the card replaces the "next goal" chip and folds to one line; tap to open it.
  - The last step shows live chapter targets (day counter, lowest cash, operating result, residents, beds, quality).
- **Chapter goal and verdict** (the CLAUDE.md user story). When day 30 closes the engine judges the chapter once and stores the verdict:
  - **Win** needs all five: cash never below zero, 10 operational beds, at least 8 residents, revenue above running costs over days 1–30 (construction excluded), and care quality of at least 70 on day 30.
  - **Bankrupt:** the first midnight that closes with cash below zero fails the chapter at once.
  - The game pauses on the verdict and a result card lists each target. The player can keep playing freely or restart chapter 1. The verdict never changes afterwards and survives saves.
- **Three scripted events:** a family visit on day 3, a resident's condition change on day 8 and a nurse resignation on day 15 teach each kind of decision. A scripted event that can't fire on its day (for example, fewer than two nurses) tries again for up to 5 days. Until then the random roll won't spend that event early. Random events fill the remaining days as before.
- **Staffing advice now follows rush hours:** the roster's "needed" count checks every busy window of each shift against the time allowed to start the tasks (90 minutes for routine care), not just the shift total. Broader roles cover narrower work, the way task assignment does: the RN does PN work in a quiet evening, and RNs and PNs help with personal care and meals.
- **Sessions moved into the morning:** therapy and activity sessions are booked from 10:00 and can start any time until 14:00. Before, bedridden residents' activity at 15:30 forced a second OT on the afternoon shift.
- **Balancing:** see *Assumptions* below. Measured with the scripted player:

  | Play style (30 days, 7 seeds) | Month-1 operating result | Verdict |
  |---|---|---|
  | Fill all 10 beds in the first days, staff to the advice | +฿11k to +฿30k | won on 7 of 7 seeds |
  | Stop at 8 residents | −฿11k to +฿14k | won on 2 of 7 seeds |
  | Stop at 6 residents | −฿25k to −฿71k | failed on 7 of 7 seeds |
  | Full home plus a second full team | loss | failed |

  A full, well-run home then makes about 16–21% in month 2. Cash never comes close to zero with sensible play (the build costs about ฿1.1M of the ฿2M), so the real challenge is operating profit: filling beds quickly without overhiring.
- **Tutorial pointers (part 3):** on top of the card, a pulsing orange ring marks the control the current step needs: the tool, the "+" for equipment, the Hire/Admit tab and button, "Create Care Plan", the short roster cell, or the play speed. Blue tiles on the map suggest where to build each Chapter 1 room beside the entrance, or which room to tap next. Suggestions appear only while still buildable. On desktop the card sits at the top-left of the map, away from the entrance where the first steps happen. Pointers follow the same state-derived goals and disappear when the card is hidden.
- **Consequences, turnover and refunds (part 3):**
  - **Families move unhappy residents out.** Below 40 satisfaction there's a seeded daily chance that grows with dissatisfaction (1.5% per point). Each move-out costs 2 reputation. A red "family is unhappy" alert appears at 45.
  - **Ordinary turnover.** After a 7-day settling-in week, a family occasionally takes their relative home (0.4% a day, about one a month in a full home). There's no reputation cost, so beds must be refilled.
  - **Unused days are refunded.** Whoever leaves gets back prepaid room & care for the rest of the month. This is a `fee_refund` ledger line netted off revenue and the room & care mix. It closes an exploit where admitting and losing residents earned a full month each time.
  - **Reputation decides refills.** Missed care costs 0.08 reputation per task at day end (at most 3 per day). Below 30 reputation, enquiries slow and the oldest waiting family leaves each day. Below 15, enquiries stop and two leave.
  - **Premium prices raise expectations more** (−0.06 per tick; value prices +0.02).
  - **Result over 90 days with beds refilled daily:** the advice-following scripted player wins Chapter 1 and stays full at 100 reputation. A skeleton crew loses money from month 1 and empties. Thin or lean staffing ends with reputation under 15, an empty waiting list and empty beds, earning less than a home staffed close to the advice.
- **Save format:** schema 5 adds `chapter.result`. Schema-3 and schema-4 saves migrate automatically; a migrated game already past day 30 is judged at its next midnight.

### Visual upgrade from the Game Assets Pack

- **Art source:** sprites were cut automatically from the project's own *Game Assets Pack* (transparent PNG), using alpha-channel connected components. They're stored as WebP: 26 sprites, about 155 KB.
- **On the map:** beds, call-bell monitors, supply carts, desks, exercise balls, parallel bars and lockers are drawn as sprites instead of boxes, with the vector box kept as a fallback. A "HEALTHCARE EMPIRE" sign sits at the entrance.
- **Garden & decor (สวนและตกแต่ง):** a new build section with 10 items: shade tree, round tree, pink trumpet tree, flower bush, hedge, planter, garden lamp, patio table, fountain and gazebo.
  - Each item takes one empty tile. It can't overlap rooms, corridor, the entrance or other decor, and rooms and corridors can't be built over it.
  - Demolish refunds 50%, and each item costs ฿10/day in upkeep.
  - Each item adds *appeal*, capped at 30. Appeal slows residents' happiness decay and lifts mental well-being slightly. Tested: a lush garden keeps residents measurably happier.
  - Rooms and garden items are drawn back to front, so trees overlap correctly.
- **Pictures in the UI:** room pictures on the build cards, equipment pictures in the room inspector, and coin, people, smile and star icons in the desktop and phone top bars.
- **7-chapter journey:** a chapters screen with cards cropped from the campaign concept art. Chapter 1 shows "playing now" and its goal progress; chapters 2–7 are marked as unlocking later. It opens from the title screen, the goals header and the phone menu, and Escape closes it.
- **Save format:** schema 4 adds `site.decor`. Older schema-3 saves are migrated automatically on load (tested).

### Save system (Phase 4, part 1)

- **Autosave:**
  - At the start of every game day, every 60 s of real time while something changed, and whenever the tab is hidden or closed. Phones kill background tabs, so the hidden-tab save matters most there.
  - A fresh, untouched game is never autosaved, so opening the page can't overwrite a real save.
- **Slots:** one autosave plus three manual slots. Each slot shows the day, time, cash, residents, staff, reputation, how long ago it was saved, and where the newest copy lives. Overwrite, load and delete each need a second tap.
- **Opening the game:** the title screen offers **เล่นต่อ** (continue the newest save, showing its day and cash), **เกมใหม่** and **โหลดเกม**.
- **Where saves live:**
  - **This browser:** IndexedDB via Dexie, falling back to memory if IndexedDB is blocked.
  - **Your account:** on the published page, saves also go to the player's private space through the page's `db` capability (`data/users/<id>/save-<slot>`). Nobody else can read it, the page owner included. Loading picks whichever copy is newer, so a game saved on a phone continues on a PC for the same signed-in player.
  - **Offline or blocked:** without the cloud (signed out, view-only access, offline), saves stay in the browser and the save panel says so.
- **Format:**
  - Versioned (`format` 1, `schemaVersion` 3). It holds the complete `GameState` gzip-compressed (about 10× smaller), so a reloaded game continues exactly as the original would.
  - Cloud saves above 200,000 characters are split into parts, keeping every document under the 256 KiB limit.
  - Loading validates the structure and the cash-ledger invariant. Damaged, tampered or unsupported saves are refused with a message, never half-loaded.
- **Loading** pauses the game and resets the view.

### Phone layout (screens under 1024 px)

- **Layout:** the active view fills the screen. A compact top bar holds the day and time, speed, cash and today's change, occupancy, satisfaction and reputation. It also has a bell with an alert count, which opens tasks, alerts and the dashboard, and a ⋯ menu for language and new game.
- **Bottom tab bar:** Map · Residents · Shift schedule · Finance · Manage. Manage opens build, hire and admit as a bottom sheet.
- **Building:**
  - Tap 🏗 สร้าง, pick a tool, and the sheet closes so you can drag on the map with one finger. A "Placing: … / Done" chip shows what you're placing.
  - Tap a room to open its details sheet: equipment, demolish, tasks, alerts.
- **Map controls:** pinch with two fingers to zoom and pan. A second finger cancels a half-drawn room without placing it. The map refits when the phone layout settles, and starts a little zoomed in on portrait screens.
- **Next goal chip:** the map shows the next goal; tapping it opens the details sheet.
- **Shift schedule:** shows one shift at a time (เช้า / บ่าย / ดึก). The "+" picker opens as a bottom panel. Event cards scroll inside the screen.
- **Tested** at 390 × 844 with real touch events (Playwright + CDP touch): pinch zoom, finger-drag building, tapping rooms to install equipment, hiring, admitting, care plans, roster and 8 game days. No horizontal page scroll, no console errors.

### Phase 3: money and events

- **Title screen** over the world-map concept art. "เริ่มเล่น" starts the game. Add `?skiptitle` to the URL to skip it.
- **Character portraits** cropped from the project's concept art: RN, PN, Caregiver, PT and OT by role; residents by gender (two female, one male portrait). They appear on hire cards, the roster, staff lists, resident profiles and event cards.
- **Billing:**
  - Room & care is billed in advance: a pro-rated invoice on admission, then a full one on day 1 of each 30-day month.
  - Completed therapy sessions (฿300), group activities (฿100) and special services (฿3,000) are billed on the next month's invoice.
  - Each family pays 1–5 days after the invoice is issued. Revenue is booked on payment, with the invoice id as the ledger reference, so it can't be counted twice.
  - At discharge, any unbilled services go on a final invoice.
- **Price level** (ประหยัด −10% / มาตรฐาน / พรีเมียม +20%). It applies to new invoices only. It also changes how many people join the waiting list and how demanding residents are. Reputation of 70 or more brings an extra applicant per day.
- **Running costs:** food (฿80) and care supplies (฿20 + ฿15 × care level) per resident per day, on top of payroll and building upkeep. Upkeep was rebalanced to ฿30–40 per tile per day.
- **Financial Dashboard (การเงิน view, step 6 in the concept art):**
  - Revenue, operating expenses and net profit, with % change against the same days of last month; receivables; capital spent.
  - Daily (this month) or monthly (all-time) revenue/expense bars with hover tooltips and a table view.
  - Revenue-mix donut (room & care, physiotherapy, activities, special services).
  - Expenses by type, a price-level selector with the fee table, and the latest invoices with paid/due status.
- **Top bar:** occupancy (residents/beds), average satisfaction, and today's change in cash.
- **Events (step 9 in the concept art):** four data-driven events, each with three choices.
  - เหตุการณ์ฉุกเฉิน (a resident's condition changes)
  - บุคลากรขอลาออก (two nurses resign)
  - โอกาสทางธุรกิจ (a partner hospital wants to refer 10 rehab patients)
  - เยี่ยมญาติ (family visit)
  - **How they run:** an event can start at 09:00 each day (30% chance, at least 3 quiet days in between, plus a per-event cooldown). The game pauses on arrival and resumes at the previous speed after a choice. "Decide later" minimises the card. After 12 game hours with no answer, the default (worst) choice is applied.
  - **Choices:** a choice can cost money, need an RN on duty, change needs, wages, morale or reputation, remove staff, or add referral candidates. Referral patients must be admitted by a deadline or reputation drops.
  - All scenarios are fictional and non-prescriptive.
- **Goals:** "Chapter 1: First Care Home" now has 13 goals, including first payment received and a profitable first month.

### Phase 2: residents, staff and daily care

- **Hire (จ้างพนักงาน tab):** 8 fictional applicants at a time, refreshed each midnight. There are five roles: RN, PN, Caregiver, PT and OT. Each role has fixed skills: assessment, vital signs, planned medication round, personal care, meal assistance, mobility and activity. The monthly wage depends on years of experience.
- **Admit (รับผู้พักอาศัย tab):** a waiting list of fictional residents in three abstract care groups (active aging, stroke rehabilitation, bedridden) at care levels 1–4. Admission takes the first free bed in an operational ward. Each bed holds one resident.
- **Resident Profile cards (ผู้พักอาศัย view, step 3 in the concept art):** age, care group, care level and bed. Six stat bars (physical health, mobility, mental well-being, happiness, satisfaction, nutrition) turn amber or red when low. The **สร้าง Care Plan** button works only once an RN is on staff. After that the card shows today's tasks as a coloured strip (done / missed / pending). Discharge needs a second click to confirm.
- **Care Plan Engine:** a plan turns group + level into a fixed daily schedule, for example vital signs 08:00, medication rounds 09:00/21:00, meal assistance, repositioning every 4 h for bedridden residents, a mobility session for stroke rehab, and a group activity. Each tick:
  - In-progress tasks finish and apply their effects.
  - Tasks still waiting 90 minutes after they're due count as missed and apply a penalty.
  - Due tasks go to staff who are **qualified, on shift, free, not exhausted, and able to reach the room**. Assignment is deterministic and prefers the least-specialised qualified person, so RNs are kept free.
- **Shift schedule (ตารางเวร view, step 4 in the concept art):**
  - A role × shift grid (Morning 07–15, Afternoon 15–23, Night 23–07). The current shift is highlighted.
  - Each cell shows avatars plus a have/needed count, and turns red when short. "+" adds a person, listing staff with the fewest shifts first. Clicking an avatar removes them from that shift.
  - Under each column: staff count, needed count, workload %, and a readiness check ("กำลังคนครบตามเป้าหมายของกะนี้", or the missing RN or missing skills).
  - A staff table shows energy, morale, live status (off duty / available / which task for whom), wage and dismissal (two-click).
- **Staff wellbeing:** energy drains while working and recovers off shift; an operational staff room helps idle staff recover. Morale drops with double shifts and exhaustion. Staff under 15 energy can't take tasks.
- **Needs:** small per-tick decay that scales with care level. Independent residents eat on their own at 08:00, 12:00 and 18:00. Residents without a care plan feel unattended.
- **On the map:** residents lie in their beds, coloured by care group. On-duty staff stand at the nursing station, or beside the bed of the resident they're caring for, coloured by role.
- **Right panel (step 5):** live care tasks (in progress with staff name, waiting for staff, next, recently missed) and alerts (no care plan, shift not ready, exhausted staff).
- **Dashboard:** occupancy (residents/operational beds), care quality (0.6 × average well-being + 0.4 × task completion), payroll per day. Payroll is charged once per day at midnight to the ledger. There are 11 goals covering building through staffing.

### Phase 0 + 1: building

- **Thai-first UI** with a one-click English toggle. The chosen language is remembered per browser.
- **Isometric 20×20 lot** drawn in PixiJS, with a road and a fixed main entrance (ประตูหน้า). Zoom with the mouse wheel or the +/− buttons. Pan with a right/middle-button drag, or a left-button drag in Select mode. The ⌖ button recenters, and the camera auto-fits on resize until you move it.
- **Building tools:**
  - **Corridor (ทางเดิน):** drag to lay tiles. You pay only for new tiles.
  - **Four room types**, each sized by dragging a rectangle: resident ward, nursing station, therapy room and staff room. Each type has its own minimum side, minimum area and maximum area.
  - **Demolish (รื้อถอน):** click a room or corridor tile for a 50% refund. The entrance can't be removed.
- **Live placement preview:** a green or red footprint, the cost, and the exact rejection reason (outside the lot, too small, too large, overlap, not enough cash). The preview uses the engine's own validators.
- **Room validation (GDD rule: "A room cannot operate without required equipment and a navigable entrance"):**
  - A room only works if a corridor that connects to the main entrance touches it (BFS pathfinding). The door is placed automatically and deterministically on the first touching wall, and it shows on the map.
  - Each room type has required equipment, for example a ward needs beds and a call-bell system. Install and sell equipment in the Inspector.
  - Ward capacity is the number of installed beds, at most 1 bed per 2 floor tiles. Capacity counts only when the room is operational.
  - Rooms that aren't operational get a red tint and a ⚠ label on the map, plus an alert in the right panel.
- **Time controls:** Pause, 1×, 2× and 4×, as buttons or with the keyboard (Space = pause/resume, 1 = pause, 2/3/4 = 1×/2×/4×, Esc = Select tool). One tick is 10 simulated minutes, and 1× runs at 2 ticks per second. Ticks are fixed-step and don't depend on frame rate.
- **Finance (construction scope only):** an immutable ledger with starting capital, construction, equipment, refunds and daily building upkeep charged at midnight. Cash is always checked against the ledger.
- **Dashboard:** cash, amount invested, upkeep per day, operational rooms, operational beds, recent transactions.
- **Goals:** a checklist derived from game state that leads to an operational 10-bed home, then staff, residents and care plans.

## Architecture

```
src/
  domain/types.ts          Plain JSON-serialisable entities (GameState, Room, Site, LedgerEntry…)
  domain/grid.ts, money.ts Grid geometry; integer-satang money helpers
  domain/rules/            Pure rules: placement.ts, navigation.ts (BFS + doors), rooms.ts (status), ledger.ts (reconcile),
                           beds.ts (unique beds, free beds), shifts.ts (overlap across midnight, daily-hours cap)
  data/rooms.ts            Room and equipment catalogue (fictional balancing values)
  data/staff.ts            Roles, skills, wages, shift slots, fictional staff names
  data/patients.ts         Care groups, task kinds and effects, care-plan schedules, fictional resident names
  data/finance.ts          Fees by care level, price levels, service prices, daily costs, 30-day month calendar
  data/events.ts           Event catalogue: eligibility windows, weights, cooldowns, choices, defaults
  data/scenarios.ts        Starter scenario (THB 2,000,000, 20×20, entrance, seed)
  sim/engine.ts            applyCommand(state, cmd) and step(state). The ONLY way state changes
  sim/systems/time.ts      Clock + deterministic event queue ordered by (minute, seq)
  sim/systems/finance.ts   Daily upkeep and payroll
  sim/systems/needs.ts     Resident need decay, independent meals, wellbeing
  sim/systems/staffing.ts  Applicant/waitlist generation (seeded), energy per tick, morale per day
  sim/systems/care.ts      Care Plan Engine: task generation, finish / miss / assign each tick
  sim/systems/billing.ts   Invoices (admission / monthly / final), service counters, payments, food and supplies
  sim/systems/events.ts    Seeded event roll, scripted chapter events, triggers, choice effects, expiry, referral deadlines
  sim/systems/chapter.ts   Chapter 1 targets and the one-time day-30 / bankruptcy verdict
  assets/                  Portraits and the world-map title image (from the project's own concept art)
  data/decor.ts            Garden items: cost, appeal, upkeep
  render/sprites.ts        Sprite URLs, map sizes, texture loading
  storage/format.ts        Versioned save format, gzip encode/decode, validation, schema migration
  storage/localStore.ts    IndexedDB (Dexie) store with in-memory fallback
  storage/cloudStore.ts    Per-player cloud store on the artifact db capability, chunked
  storage/saves.ts         SaveManager: dual write, newest-copy load, slot list, latest
  sim/rng.ts               Seeded mulberry32; RNG state lives inside GameState
  sim/selectors.ts         Derived summaries and build goals (never stored)
  render/iso.ts            Pure isometric projection math
  render/IsoRenderer.ts    PixiJS renderer: reads state, reports pointer cells, never mutates
  ui/                      React components, Zustand store, i18n (TH/EN), game loop
  ui/components/Tutorial.tsx  Guided tutorial card, "Show me" actions, step toasts
  tests/                   Vitest specs; tests/bot.ts is the scripted player used for playthroughs and balancing
```

**Separation rule:** the simulation (`domain/`, `sim/`, `data/`) doesn't import React or Pixi. The UI turns input into `Command`s, the engine returns a new state, and the renderer draws it. Swapping the 2.5D renderer for 3D later won't touch any business logic.

### Conventions and invariants

- Money is **integer satang** everywhere (`thb(2_000_000)` → `200_000_000`). Non-integer ledger amounts throw.
- Time is **simulation minutes** since day 1 00:00. A new game starts at day 1 07:00, and a day is 144 ticks.
- Randomness only comes from the seeded PRNG stored in state. It generates applicants and the waiting list.
- Ledger entries are append-only and frozen. `organization.cashSatang` must always equal the ledger sum (`reconcile()`).
- `applyCommand` and `step` are pure: they never mutate their input, and the same input always gives the same output.
- A failed command returns `{ ok: false, reason }` and the exact same state object, so nothing is charged.
- **Phase 2 invariants:**
  - One resident per bed; an occupied bed can't be removed, and an occupied ward can't be demolished or made non-operational.
  - An employee can't have overlapping shifts (including across midnight) or more than 16 hours a day.
  - No care task goes to anyone without the required skill.
  - Only an assessment-qualified employee (RN) can write a care plan.
- Need values are rounded to 2 decimals each tick, so floating-point noise can never make two runs drift apart.
- **Phase 3 invariants:**
  - At most one admission or monthly invoice per resident per month.
  - An invoice is paid once, and every revenue entry references a unique invoice.
  - Revenue equals the total of paid invoices.
  - Food, supplies, upkeep and payroll are each charged once per day.
  - An event's cost is charged once, and a resolved event can't be resolved again.

## Tests (221 passing)

| File | Covers |
|---|---|
| `rng-time.test.ts` | PRNG reproducibility and range; 10-minute ticks; 144 ticks per day; one `day_end` event rescheduled each midnight; queue ordering |
| `placement.test.ts` | Construction cost deducted **once** with one referenced ledger entry; input not mutated; rejects collisions (rooms, corridor, entrance), out of bounds, too small/large, unaffordable; demolition refunds once and frees cells; corridor charges only new tiles; entrance protected |
| `rooms.test.ts` | BFS reachability from the entrance; no access without a corridor; deterministic door; cutting a corridor disconnects; equipment needed to operate; bed cap by area, never negative; wrong equipment rejected; 10-bed ward completes the goal |
| `determinism.test.ts` | 30 simulated days twice with the same seed give byte-identical state; upkeep charged exactly 30 times with unique day refs; ledger reconciles; state survives a JSON round-trip (save-ready) |
| `people.test.ts` | Admit up to capacity and **reject excess admission**; no admission to non-operational wards; occupied ward/bed protection; discharge frees the bed; shift overlap across midnight; **overlapping shifts rejected**; double-shift cap; dismissal hands back tasks; care plan needs an RN, once; **no care without the required skill**; off-shift staff don't work; least-specialised staff chosen; unreachable wards get no care; **30 days twice with one seed give byte-identical state**; a well-staffed home completes >95% of tasks with every resident's well-being >45; payroll charged exactly once per day; ledger reconciles; an unstaffed home declines |
| `roster.test.ts` | Role × shift readiness (missing RN, missing skills); a covered shift becomes ready; occupancy and quality KPIs |
| `finance.test.ts` | Pro-rated admission invoice; **monthly invoice created exactly once** (re-running billing is a no-op); each payment books revenue once and revenue equals paid invoices; therapy sessions billed on the next invoice and reset; food and supplies once per day; price level changes only new invoices; a full 10-bed home runs 30 days with cash rising and positive every day; finance view totals match the ledger and the revenue mix |
| `events.test.ts` | Auto-pause and speed restore; no double resolve; a choice cost charged once; urgent assessment needs an RN on duty; raise (+10%) vs accept (both nurses leave); referral deadline costs reputation; default choice after 12 h; seeded and deterministic over 30 days with cooldowns; at least 3 quiet days between events |
| `saves.test.ts` | **Save and reload gives identical state**, and the reloaded game then runs identically for 300 ticks; gzip makes it at least 3× smaller; corrupt, tampered (cash ≠ ledger) and incompatible saves rejected without throwing; IndexedDB store round-trip (fake-indexeddb); cloud store splits large saves into parts under 256 KiB and reassembles them; the newest copy wins across two devices sharing one account; works without cloud; local save survives cloud failure |
| `decor.test.ts` | Decor placed on an empty tile and charged once; can't overlap rooms, corridor, entrance or decor, and blocks building over it; demolish refunds half; appeal is capped and makes residents happier; schema-3 saves migrate to schema 4 |
| `chapter.test.ts` | **30-day playthrough** by a scripted sensible player using only public commands and the real applicant and waiting-list pools: wins chapter 1 with cash positive every day; every invariant holds (ledger, unique beds, no overlapping shifts, no care without the skill); roster ready and >95% of tasks done; the three scripted events fire on their days; the same seed plays byte-identically; the verdict pauses the game and survives a save. **Balance:** a full home wins on more seeds, a 40% empty home and an overstaffed home fail on targets. **Verdict rules:** bankrupt at the first negative midnight, decided once and never changed; nothing decided before day 30; a migrated save past day 30 is judged at the next midnight. **Tutorial:** step order, derived from state, a goal and a how-to hint in Thai and English for every step. **Staffing advice:** rush-hour windows, RN covering PN work, one OT for ten sessions |
| `chapter2.test.ts` | **90-day campaign** by the scripted player: wins Chapter 1, starts Chapter 2 on day 31 and wins it on day 90 with every target; dementia residents only in secured wards; airway care only by RNs and tube feeding only by RNs/PNs; an RN on the night roster; >93% of tasks done; byte-identical rerun; a reckless builder's lowest cash falls far below the careful one, with at least one bankruptcy; a second full team fails the chapter. **Rules:** the next chapter only after a win, with one candidate per programme; secured-ward admission; RN-only airway care missed with only a PN on nights; programme fees; schema-5 migration; Thai and English text for every Chapter 2 step |
| `support.test.ts` | Support applicants appear only once their room exists; pharmacy supply cut; dining meal bonuses; nutritionist and cleaner daily lift; laundry upkeep cut; a receptionist adds an enquiry and a security guard lifts satisfaction; the storage room cuts supplies on top of the pharmacy; the bath & hygiene room shortens personal care; pharmacists take med rounds and nutritionists meals, with no missed meals; support rooms are optional |
| `autopilot.test.ts` | Off by default and switched by command; with all switches on, a built home runs 30 days on its own (8+ residents, every one with a plan, an RN hired, >90% of care done, cash positive, ledger and unique beds intact); from the starter campus it builds every basic room, staffs and fills the home and wins chapter 1 solvent; it builds only what is missing or needed and never without money to spare; "play every chapter" wins chapters 1–3 back to back unattended and carries straight on into chapter 4; after a verdict it starts the next chapter on a win or replays on a loss, at the speed before; Home Care, training, placements and the shop each work on their own (from their chapter, touching nothing else, and the shop never buys when short); time away is played out at the game's speed, capped at 30 days; pricing picks value, premium or standard by demand; staff care gives a tired person their second shift off and builds a staff room; the garden switch plants up to full appeal away from corridors; alerts fire for low cash and for a paused game; events answered at once without pausing, accepting the staff request; nothing happens with it off |
| `land.test.ts` | Three plots sold in order for their prices, each from its chapter, keeping every room and corridor tile; then already done; locked by chapter and by cash; a room can be built on the newest plot; the autopilot's land purchase runs a corridor into the new plot so a villa can open there |
| `supabase.test.ts` | A save round-trips through `game_saves` rows: one row per part, each under the size check, keyed by the player's id; another player sees none of it; removal deletes every part; off without the build settings; Supabase auth messages map to the reasons the sign-in window explains |
| `shop.test.ts` | Upgrades are bought once, for their price, from their chapter (all at once in the sandbox); the central kitchen and laundry cut food and supplies by their percentages; staff welfare adds morale; online marketing adds an enquiry; the family app lifts reputation while residents are content; the smart call system keeps late routine care pending 30 minutes longer |
| `modes.test.ts` | Campaign games are unchanged; sandbox books ฿50M as capital, unlocks every room, has no tutorial steps and is never judged after 70 days; each challenge opens with its own cash, reputation or chapter; each challenge is won by the scripted player and ends without a next chapter |
| `chapter7.test.ts` | **Full 390-day campaign:** all 7 chapters won on schedule and solvent, ledger reconciles; one branch of each kind, each manager of the right role and off the roster; branch invoices exact; network occupancy ≥ 70%. **Opening:** locked before chapter 7; manager role checked; full opening cost charged; managers can’t take shifts or a second branch; cap of 5. **Running:** good branches fill and bill daily, poor ones empty, a poor name at headquarters stops growth; certificates raise the quality target; a lost manager leaves the branch leaderless until one is appointed; support visits lift quality, cost money and have a cooldown; closing refunds 30% and frees the manager; busy clinic branches refer to the stroke unit. Guide order; v9→v10 migration |
| `chapter6.test.ts` | **Full 330-day campaign:** chapters 1–6 all won on schedule and solvent, ledger reconciles; OPD and IPD invoices are exact; inpatients only in unique stroke-unit beds, which don’t count as home beds; doctors only do doctors’ work. **Clinic:** locked before chapter 6; 6 bookings per desk from the next day and only with a doctor (4 below reputation 60); one doctor with two desks sees some patients and the rest leave; never more consultations at once than desks. **Stroke unit:** admission plans every round; full beds refuse; staffed stays go home as planned and bill their days, unstaffed ones end complicated; unserved referrals cost reputation. Guide order; v8→v9 migration |
| `chapter5.test.ts` | **Full 270-day campaign:** chapters 1–5 all won on schedule and solvent, ledger reconciles, at least 6 certified staff, b2b invoices are quantity × rate, and placed staff hold no shifts. **Training:** needs a room, the right role and a free seat; the cost is charged; class is taken in the shift, in the room; passing adds the certificate and qualification; staff without shifts attend 08:00–16:00. **Placements:** role and certificate checks; placed staff leave the roster and can’t get shifts or courses; 07:00–15:00 away, billed per day, released at the end; ending early or dismissal costs reputation; requests only from chapter 5 with a room, and they expire. Guide order; v7→v8 save migration |
| `chapter34.test.ts` | **Full 210-day campaign** by the careful scripted player: chapters 1–4 all won on schedule and solvent, ledger reconciles; premium residents only in villas; visits only by qualified staff, billed per visit, and staff on a visit leave the map. **Chapter 3 rules:** land bought once, from chapter 3, keeping every corridor tile; villas locked before chapter 3 and premium-only; a garden keeps premium families content. **Chapter 4 rules:** clients need a centre with a van; one van takes one visit at a time and done visits bill at midnight; missed visits lead to cancellation; visits need the skill and a shift; schema-6 migration; Thai and English text for every step |
| `prefabs.test.ts` | Ready-made rooms place the room and equipment in one command for exactly the hand-built price; all or nothing on overlap or short cash; rotation; chapter locks; labels. Starter campus: built and paid from capital, tutorial skips straight to the ward step, deterministic; the empty template changes nothing. Retrying a failed chapter restarts its days with the same business and is refused otherwise |
| `care-fairness.test.ts` | Regression for care triage: when staff are briefly short, equal-priority tasks go to the least satisfied resident first, so no resident in a 30-day scripted playthrough is left far below the rest (seeds 1 and 3 used to leave the last-admitted resident near 60 satisfaction while everyone else was near 100) |
| `balance.test.ts` | 90 days with daily refills: a skeleton crew loses money and empties; thin and lean staffing lose reputation, their waiting list and beds, and earn less than mid staffing; premium prices with thin care drive families away; a 60%-full home barely breaks even; shortfalls are shared; the advice-following player wins and stays full and well regarded for 90 days. Leaving: unused days refunded once; no departures in the settling-in week; turnover costs no reputation; low reputation makes waiting families look elsewhere. Unhappy families move out (bed freed, reputation hit, deterministic); missed tasks cost reputation; low reputation dries up enquiries |
| `tour.test.ts` | Tutorial pointers: walking the build-up by the suggested tiles alone gives a working home (ward with 10 beds, station, therapy, staff room); the ring targets the tool, then the equipment "+", then the Hire, Admit, Care Plan and roster controls; no suggestion on taken tiles; long goals carry no pointer |
| `i18n-iso.test.ts` | TH/EN key parity; labels for every room, equipment and reason; Thai interpolation; iso projection inverts for all 400 cells |

GDD acceptance tests covered so far: *place a room and deduct construction cost once*, *reject collisions*, *admit up to capacity*, *reject excess admission*, *schedule a qualified staff member*, *prevent overlapping shifts*, *advance 30 days deterministically with a fixed seed*, *reconcile cash ledger*, *show Thai text correctly*, *run production build without errors*. *Create monthly invoice once* is now covered too. *Save and reload identical state* is now covered as well, so **all GDD acceptance tests pass**.

The Phase 4 browser playtest (Playwright on the production build, run outside the repo) started from the title screen at 1440 × 900. It followed the tutorial card through every step. "Show me" opened the corridor tool and the Hire tab, and the card advanced as the home was built, staffed and filled. It then played 30 days, answering each event, and the win card appeared on day 30 with all five targets met. "Keep playing freely" closed it. At 390 × 844 with touch, the folded card opened and "Show me" picked the corridor tool, with no horizontal scroll. No console errors.

The Phase 3 browser playtest started from the title screen, built and staffed the home through the UI, and admitted 6 residents. It then played 35 days, answering every event through the event card: 12 invoices issued, 11 paid, cash still positive, and no console errors.

The Phase 2 browser playtest built the home with mouse drags, then used only on-screen controls:
- Hired all 8 applicants from the Hire tab and admitted 5 residents from the Admit tab.
- Pressed "สร้าง Care Plan" on each resident card and filled the roster through the grid's "+" pickers.
- Ran at 4×. Day 1 closed with 39 tasks done and 2 missed. The misses were afternoon group activities with no OT on that shift, and the roster flagged that gap.

A browser playtest (Playwright, run outside the repo) drove the production build with real mouse drags. It built a corridor, a ward with 10 beds, a nursing station, a therapy room and a staff room, got the overlap error on a collision attempt, ran at 4×, paused, switched to English, and checked a 390 px phone width.

## Assumptions

- **Balancing (fictional):**
  - Costs: start THB 2,000,000; corridor THB 3,000/tile; rooms THB 30–50k base + THB 12,000/tile; equipment THB 12–60k; upkeep THB 15–25/tile/day (THB 5 per corridor tile).
  - Fees: monthly room & care THB 29k / 33k / 39k / 46k for care levels 1–4, plus THB 4k / 6k / 12k for the dementia / tube-feeding / tracheostomy programmes.
  - Result: a full 10-bed starter build costs about THB 1.1M. A full home staffed to the roster advice (8–10 people) is slightly profitable in month 1 and makes about 16–21% from month 2. At 60% occupancy it loses money.
- The chapter's "positive cashflow" is read as **operating** cash flow: payments received minus payroll, upkeep, food, supplies and event costs over days 1–30. Construction and equipment are investment and don't count against it. Therapy and activity sessions are billed on the next month's invoice, so month 1 earns room & care only.
- The GDD's CMNH figures are kept as scenario reference only and aren't used for tuning. Real organisation names aren't used in-game.
- Doors are automatic, not hand-placed: the first front-facing perimeter tile that touches a reachable corridor.
- A room can sit next to another room, but you can't walk through one room to reach another. Access is only by corridor.
- 50% refund on demolition and on selling equipment.
- Reputation starts at 50. Each day it drifts with average resident satisfaction (above 60 raises it), loses 0.08 per missed task (at most 3), and loses 2 per family move-out.
- Staffing "needed" counts: one RN on each day shift while residents are present, plus enough people that every busy window of the shift fits (each task may start until its grace time runs out, capped at the shift end). Night shifts only need the skills their tasks use.
- Care is abstract and non-prescriptive. Tasks name only a kind of work and the qualification it needs, never a treatment.

## Known limitations

- On-screen pointers (the coral ring and suggested tiles) cover Chapter 1; later chapters guide with text and the "Show me" button.
- All 7 chapters are playable. After the Chapter 7 verdict the game continues as free play. 
- Branches are portfolio-level numbers, not separate maps you can build on.
- On a cash-poor seed (seed 5), the careful scripted player builds villas too late in chapter 3 and misses the premium target (3 of 4). Building villas earlier or keeping a spare one made other seeds go bankrupt in chapter 4, so the bot is unchanged; a human player can take that risk.
- Daycare (the second half of the concept art's Chapter 4) isn't modelled yet. Home visits have no travel map; travel is folded into the 100-minute visit.
- The bought lot is 32×20. Multi-site work (Phase 6) will add separate sites.
- Chapter 2 is easy on profit once the home is full; its real challenge is cash flow during expansion. Later chapters should add new cost pressure.
- The scripted player used for balancing hires strictly by the roster advice. Real players can do better, for example with the premium price level, so the chapter is meant to be a fair first challenge, not a hard one.
- Starting a **new game** overwrites the autosave once the new game has progress. Use a manual slot to keep an older game.
- Cloud saves need a signed-in viewer allowed to use the page (the owner always is). Anyone opening a public link with view-only access saves in their browser only.
- Months are a flat 30 game days. Families always pay; there are no bad debts or late fees yet.
- Portraits are per role, so two nurses share a face (with different expressions). Female residents still use the earlier portrait style. Map characters stand still; walking (as in CMNH V16) is not done yet.
- Within the first 90 days, staffing a little below the roster advice (about 85% of tasks done) can still out-earn following it exactly. The risk shows up later, as reputation slides and empty beds stop refilling. The Phase 4 balancing table above was measured before turnover and refunds were added; the chapter tests still pass.
- Events are generic: they don't yet react to specific causes (for example, burnout after many double shifts).
- Shifts are a standing daily roster (the same every day). There's no weekly pattern, leave or sick days yet.
- Staff don't walk. They appear at the station or at the bedside when a task starts, and travel time isn't simulated.
- Morale is tracked and shown but doesn't yet cause resignations.
- Room rotation and room moving aren't supported (demolish and rebuild instead). On phones the staff table still scrolls sideways.
- The UI font loads from Google Fonts with Thai system-font fallbacks. Offline it falls back to Noto Sans Thai, Leelawadee UI or Tahoma.
- The renderer redraws the static layer whenever the site changes. That's fine for 20×20 but should be layered/cached before larger maps.
- The production JS bundle is about 570 kB (PixiJS). Code-splitting can come later.
