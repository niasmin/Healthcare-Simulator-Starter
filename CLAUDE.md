# Healthcare Empire Simulator — Claude Code Instructions
Build a playable browser-based single-player healthcare management simulator. Thai-first UI with English toggle. Use TypeScript, React, Vite, Zustand, Tailwind, and PixiJS for an isometric 2.5D grid. Persist versioned saves in IndexedDB via Dexie. All simulation logic must be pure deterministic TypeScript, separated from React/Pixi rendering. No real patient data.

## First milestone (MVP)
1. Vite application with dashboard and playable 20x20 build grid, zoom/pan, select/place/delete rooms.
2. Four room types: general bed, nursing station, therapy, staff room. Room validation and navigable paths.
3. Seeded simulated residents, staff, needs, care tasks and daily shifts.
4. Tick simulation at pause, 1x, 2x, 4x. Deterministic event queue and seeded PRNG.
5. Hiring, room construction, daily care assignments, basic invoices, costs, revenue, occupancy, quality and cash dashboard.
6. Tutorial goals and three scripted events; autosave/load; unit tests for simulation rules.
7. No actual medical treatment recommendations; clinical actions abstracted to qualification and safety checks.

## Architecture
src/domain/types.ts; src/domain/rules/; src/sim/engine.ts; src/sim/systems/{time,needs,staffing,care,finance,events}.ts; src/data/{rooms,staff,patients,scenarios}.ts; src/ui/; src/render/; src/storage/; src/tests/.
Use integer satang for money, simulation minutes for time, fixed seed for randomness. Keep business entities separate, transactions immutable, and enforce invariants (nonnegative capacity, unique bed assignment, no overlapping staff shifts, no care without required qualifications). Document assumptions and tests. Build iteratively; run tests and build after each phase.

## Initial user story
Player starts with THB 2,000,000 (fictional game balancing), a 20x20 lot, and must build a 10-bed nursing home, hire staff, admit residents, meet needs and maintain positive cashflow for 30 simulated days. Initial prices and costs are fictional game balancing values, not real clinical tariffs.

## Longer roadmap
Premium villas, dementia, tracheostomy, feeding and rehab as abstract care levels; homecare dispatch, PHC workforce B2B, hospital OPD/IPD, product inventory, marketing funnels, partnerships, multi-site enterprise dashboard, scenario editor.
