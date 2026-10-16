# Healthcare Empire: Care & Beyond — Game Design Document v1.0

## Concept
Single-player, Thai-first isometric 2.5D hospital and nursing home tycoon inspired by interconnected healthcare businesses. A human-centered simulator where safety, staffing, resident wellbeing, finances, and growth interact.

## Core loop
Plan -> build -> hire -> admit -> assign care -> simulate -> review KPI -> improve -> expand.

## Business units
- Nursing home: bed occupancy, acuity, care plans, rehabilitation, staffing.
- Premium senior living: villas, recreation, amenities, family satisfaction.
- Home care: dispatch, travel, skill matching, recurring service.
- Workforce: nurse staffing contracts, training, certifications, B2B SLAs.
- Neuro hospital: OPD, IPD, abstract triage, rehab, discharge referrals.
- Products: inventory, procurement, bundles, pricing, distribution.

## Scenario reference (not a live financial statement)
CMNH: 12 Alzheimer beds at THB 23,000; 15 tracheostomy at THB 35,000; 25 NG at THB 30,000; 28 rehab at THB 25,000. Example occupied 12/12/23/22; revenue THB 1,936,000/month, occupancy 69/80. Distinguish these reference assumptions from gameplay tuning. Never treat this as actual current operations.

## Simulation
- Tick length: 10 simulated minutes; day is 144 ticks.
- Patient stats 0..100: comfort, nutrition, mobility, social, mental wellbeing, satisfaction; acuity and qualifications drive workload.
- Staff: role, certifications, energy, morale, shift, wage, workload.
- Tasks: scheduled time, duration, priority, required skill, location, status.
- Building: grid cells, room footprints, placement cost, equipment requirements, paths, capacity.
- Finance: ledger entries in integer satang, charges, payroll, supplies, operating expenses, invoices.
- Events: data-driven trigger conditions, choices, effects, cooldowns.
- Quality: patient needs, staff workload, missed tasks, safety readiness; never infer medical efficacy.

## MVP UI
Top bar: game time, pause/speeds, cash, reputation. Left: build/hire/admit tabs. Center: isometric 20x20 site. Right: inspector, tasks and alerts. Bottom: finance/occupancy/quality dashboard. Thai and English localization.

## Data model
Organization(id,type,cash); Site(id,organizationId,grid,rooms); Room(id,type,tiles,capacity,equipment); Resident(id,needs,acuity,bedId,carePlanId); Employee(id,role,skills,energy,morale,wage); Shift(id,employeeId,start,end,siteId); CareTask(id,residentId,skill,dueAt,duration,status); Invoice(id,clientId,lines,status); LedgerEntry(id,organizationId,amountSatang,category,at); Event(id,trigger,choices,effects).

## Rules
- Only one resident per bed.
- A room cannot operate without required equipment and a navigable entrance.
- Care tasks require qualified, available staff.
- No overlapping shifts for an employee.
- Financial entries must reconcile and never double-count revenue.
- Patient events are fictional, abstract, non-diagnostic, and non-prescriptive.
- Keep all saves local; never import identifiable patient records.

## Milestones
M0 scaffold and tests; M1 grid and rooms; M2 staff/residents/tasks; M3 finance/events/dashboard; M4 save/tutorial; M5 premium and homecare; M6 hospital and multi-site. Each milestone must produce a playable build, passing tests and documented known limitations.

## Acceptance tests
Place a room and deduct construction cost once; reject collisions; admit up to capacity; reject excess admission; schedule a qualified staff member; prevent overlapping shifts; advance 30 days deterministically with a fixed seed; create monthly invoice once; reconcile cash ledger; save and reload identical state; show Thai text correctly; run production build without errors.
