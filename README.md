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
| 3 | Revenue and invoices, full finance dashboard, events | ⏳ Not started |
| 4 | Save/load (Dexie), tutorial, balancing | ⏳ Not started |
| 5–6 | Premium living, home care, workforce, hospital, multi-site | ⏳ Not started |

## What you can play now

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
  data/scenarios.ts        Starter scenario (THB 2,000,000, 20×20, entrance, seed)
  sim/engine.ts            applyCommand(state, cmd) and step(state). The ONLY way state changes
  sim/systems/time.ts      Clock + deterministic event queue ordered by (minute, seq)
  sim/systems/finance.ts   Daily upkeep and payroll
  sim/systems/needs.ts     Resident need decay, independent meals, wellbeing
  sim/systems/staffing.ts  Applicant/waitlist generation (seeded), energy per tick, morale per day
  sim/systems/care.ts      Care Plan Engine: task generation, finish / miss / assign each tick
  sim/rng.ts               Seeded mulberry32; RNG state lives inside GameState
  sim/selectors.ts         Derived summaries and build goals (never stored)
  render/iso.ts            Pure isometric projection math
  render/IsoRenderer.ts    PixiJS renderer: reads state, reports pointer cells, never mutates
  ui/                      React components, Zustand store, i18n (TH/EN), game loop
  tests/                   Vitest specs
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

## Tests (50 passing)

| File | Covers |
|---|---|
| `rng-time.test.ts` | PRNG reproducibility and range; 10-minute ticks; 144 ticks per day; one `day_end` event rescheduled each midnight; queue ordering |
| `placement.test.ts` | Construction cost deducted **once** with one referenced ledger entry; input not mutated; rejects collisions (rooms, corridor, entrance), out of bounds, too small/large, unaffordable; demolition refunds once and frees cells; corridor charges only new tiles; entrance protected |
| `rooms.test.ts` | BFS reachability from the entrance; no access without a corridor; deterministic door; cutting a corridor disconnects; equipment needed to operate; bed cap by area, never negative; wrong equipment rejected; 10-bed ward completes the goal |
| `determinism.test.ts` | 30 simulated days twice with the same seed give byte-identical state; upkeep charged exactly 30 times with unique day refs; ledger reconciles; state survives a JSON round-trip (save-ready) |
| `people.test.ts` | Admit up to capacity and **reject excess admission**; no admission to non-operational wards; occupied ward/bed protection; discharge frees the bed; shift overlap across midnight; **overlapping shifts rejected**; double-shift cap; dismissal hands back tasks; care plan needs an RN, once; **no care without the required skill**; off-shift staff don't work; least-specialised staff chosen; unreachable wards get no care; **30 days twice with one seed give byte-identical state**; a well-staffed home completes >95% of tasks with every resident's well-being >45; payroll charged exactly once per day; ledger reconciles; an unstaffed home declines |
| `roster.test.ts` | Role × shift readiness (missing RN, missing skills); a covered shift becomes ready; occupancy and quality KPIs |
| `i18n-iso.test.ts` | TH/EN key parity; labels for every room, equipment and reason; Thai interpolation; iso projection inverts for all 400 cells |

GDD acceptance tests covered so far: *place a room and deduct construction cost once*, *reject collisions*, *admit up to capacity*, *reject excess admission*, *schedule a qualified staff member*, *prevent overlapping shifts*, *advance 30 days deterministically with a fixed seed*, *reconcile cash ledger*, *show Thai text correctly*, *run production build without errors*. Still open: *create monthly invoice once* (Phase 3) and *save and reload identical state* (Phase 4).

The Phase 2 browser playtest built the home with mouse drags, then used only on-screen controls:
- Hired all 8 applicants from the Hire tab and admitted 5 residents from the Admit tab.
- Pressed "สร้าง Care Plan" on each resident card and filled the roster through the grid's "+" pickers.
- Ran at 4×. Day 1 closed with 39 tasks done and 2 missed. The misses were afternoon group activities with no OT on that shift, and the roster flagged that gap.

A browser playtest (Playwright, run outside the repo) drove the production build with real mouse drags. It built a corridor, a ward with 10 beds, a nursing station, a therapy room and a staff room, got the overlap error on a collision attempt, ran at 4×, paused, switched to English, and checked a 390 px phone width.

## Assumptions

- **Balancing (fictional):** start THB 2,000,000; corridor THB 3,000/tile; rooms THB 30–50k base + THB 12,000/tile; equipment THB 12–60k; upkeep THB 80–120/tile/day. A full 10-bed starter build costs about THB 1.1–1.4M, which leaves room for Phase 2 payroll.
- The GDD's CMNH figures are kept as scenario reference only and aren't used for tuning. Real organisation names aren't used in-game.
- Doors are automatic, not hand-placed: the first front-facing perimeter tile that touches a reachable corridor.
- A room can sit next to another room, but you can't walk through one room to reach another. Access is only by corridor.
- 50% refund on demolition and on selling equipment.
- Reputation starts at 50 and drifts each day with average resident satisfaction (above 60 raises it).
- Staffing "needed" counts assume 384 productive minutes per 8-hour shift and one RN on each day shift while residents are present. Night shifts only need the skills their tasks use.
- Care is abstract and non-prescriptive. Tasks name only a kind of work and the qualification it needs, never a treatment.

## Known limitations

- No resident fees, invoices or revenue yet (Phase 3), so cash only goes down: construction, upkeep, payroll. Scripted events (family visit, burnout, referral) are Phase 3.
- Shifts are a standing daily roster (the same every day). There's no weekly pattern, leave or sick days yet.
- Staff don't walk. They appear at the station or at the bedside when a task starts, and travel time isn't simulated.
- Morale is tracked and shown but doesn't yet cause resignations.
- No save/load yet (Phase 4). Refreshing the page starts a new game. State is already JSON-serialisable and tested for round-trips, so Dexie persistence is a thin addition.
- No touch pinch-zoom (use the +/− buttons). Room rotation and room moving aren't supported (demolish and rebuild instead).
- The UI font loads from Google Fonts with Thai system-font fallbacks. Offline it falls back to Noto Sans Thai, Leelawadee UI or Tahoma.
- The renderer redraws the static layer whenever the site changes. That's fine for 20×20 but should be layered/cached before larger maps.
- The production JS bundle is about 570 kB (PixiJS). Code-splitting can come later.
