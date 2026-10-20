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

## Milestone status

| Phase | Scope | Status |
|---|---|---|
| **0** | Scaffold, data models, deterministic engine, tests | ✅ Done |
| **1** | 20×20 isometric map, room building and validation, camera | ✅ Done (first playable build) |
| **2** | Residents, staff, needs, care plans, care tasks, role × shift roster | ✅ Done |
| **3** | Pricing, monthly invoices and payments, running costs, Financial Dashboard, 4 events, title screen, character portraits | ✅ Done |
| **4** | Save/load, guided tutorial, 30-day chapter goal with win/lose verdict, three scripted events, balancing | ✅ Done (**MVP complete**) |
| **5** | Chapter campaign; Ch. 2 nursing center with specialised programmes; Ch. 3 premium villas (Tranquila); Ch. 4 Home Care | ✅ Done |
| 6 | Workforce, hospital, multi-site | ⏳ Not started |

## What you can play now

Playable today, as one 210-day campaign with the same business:

| Chapter | Days |
|---|---|
| 1. First Care Home | 1–30 |
| 2. Professional Nursing Center | 31–90 |
| 3. Tranquila Senior Living | 91–150 |
| 4. Home Care | 151–210 |

Chapters 5–7 (PHC workforce, Neuro Hospital, multi-site empire) come in Phase 6.

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
  - **Clients:** enquiries arrive daily once the centre is open. Each accepted client gets one daily appointment between 08:00 and 13:00; appointments are handed out so they spread over the morning.
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

## Tests (123 passing)

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
| `chapter34.test.ts` | **Full 210-day campaign** by the careful scripted player: chapters 1–4 all won on schedule and solvent, ledger reconciles; premium residents only in villas; visits only by qualified staff, billed per visit, and staff on a visit leave the map. **Chapter 3 rules:** land bought once, from chapter 3, keeping every corridor tile; villas locked before chapter 3 and premium-only; a garden keeps premium families content. **Chapter 4 rules:** clients need a centre with a van; one van takes one visit at a time and done visits bill at midnight; missed visits lead to cancellation; visits need the skill and a shift; schema-6 migration; Thai and English text for every step |
| `prefabs.test.ts` | Ready-made rooms place the room and equipment in one command for exactly the hand-built price; all or nothing on overlap or short cash; rotation; chapter locks; labels. Starter campus: built and paid from capital, tutorial skips straight to the ward step, deterministic; the empty template changes nothing. Retrying a failed chapter restarts its days with the same business and is refused otherwise |
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
- Reputation starts at 50 and drifts each day with average resident satisfaction (above 60 raises it).
- Staffing "needed" counts: one RN on each day shift while residents are present, plus enough people that every busy window of the shift fits (each task may start until its grace time runs out, capped at the shift end). Night shifts only need the skills their tasks use.
- Care is abstract and non-prescriptive. Tasks name only a kind of work and the qualification it needs, never a treatment.

## Known limitations

- The tutorial guides through text and a "Show me" button; it doesn't yet spotlight individual buttons on screen.
- Chapters 1–4 are playable. After the Chapter 4 verdict the game continues as a sandbox, and chapters 5–7 stay locked.
- Daycare (the second half of the concept art's Chapter 4) isn't modelled yet. Home visits have no travel map; travel is folded into the 100-minute visit.
- The bought lot is 32×20. Multi-site work (Phase 6) will add separate sites.
- Chapter 2 is easy on profit once the home is full; its real challenge is cash flow during expansion. Later chapters should add new cost pressure.
- The scripted player used for balancing hires strictly by the roster advice. Real players can do better, for example with the premium price level, so the chapter is meant to be a fair first challenge, not a hard one.
- Starting a **new game** overwrites the autosave once the new game has progress. Use a manual slot to keep an older game.
- Cloud saves need a signed-in viewer allowed to use the page (the owner always is). Anyone opening a public link with view-only access saves in their browser only.
- Months are a flat 30 game days. Discharge mid-month doesn't refund prepaid room & care. Families always pay; there are no bad debts or late fees yet.
- Portraits are per role, so two nurses share a face (with different expressions). Female residents still use the earlier portrait style. Map characters stand still; walking (as in CMNH V16) is not done yet.
- Events are generic: they don't yet react to specific causes (for example, burnout after many double shifts).
- Shifts are a standing daily roster (the same every day). There's no weekly pattern, leave or sick days yet.
- Staff don't walk. They appear at the station or at the bedside when a task starts, and travel time isn't simulated.
- Morale is tracked and shown but doesn't yet cause resignations.
- Room rotation and room moving aren't supported (demolish and rebuild instead). On phones the staff table still scrolls sideways.
- The UI font loads from Google Fonts with Thai system-font fallbacks. Offline it falls back to Noto Sans Thai, Leelawadee UI or Tahoma.
- The renderer redraws the static layer whenever the site changes. That's fine for 20×20 but should be layered/cached before larger maps.
- The production JS bundle is about 570 kB (PixiJS). Code-splitting can come later.
