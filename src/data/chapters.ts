import { thb } from '../domain/money';
import type { CareGroup } from '../domain/types';

/**
 * Campaign chapters (concept-art road map). Each one is judged once by the engine when its last day
 * closes. Targets are FICTIONAL game balancing. All seven chapters of the road map are playable.
 */
export interface ChapterDef {
  id: number;
  /** Length of the challenge in days, counted from the day the chapter starts. */
  days: number;
  targetBeds: number;
  targetResidents: number;
  /** Care quality (0..100) on the last day. */
  targetQuality: number;
  /** Registered nurses on staff when the chapter closes. */
  targetRn?: number;
  /** Specialised programmes that must each have at least one resident. */
  programmes?: CareGroup[];
  /** Care groups that join the waiting list during this chapter (repeat a group to make it more common). */
  groups: CareGroup[];
  /** Chapter 3: premium residents living in villas, their average satisfaction, and garden appeal. */
  targetPremium?: number;
  targetPremiumSat?: number;
  targetAppeal?: number;
  /** Chapter 4: home-care clients and the share of visits completed over the last 7 days (0..1). */
  targetClients?: number;
  targetVisitRate?: number;
  /** Chapter 5: staff holding at least one training certificate, and placement contracts completed in the chapter. */
  targetCertified?: number;
  targetContracts?: number;
  /** Chapter 6: consultations completed in the chapter, the 7-day consultation rate, and smooth stroke-unit discharges. */
  targetConsults?: number;
  targetConsultRate?: number;
  targetDischarges?: number;
  /** Chapter 7: branches open (and how many different kinds), network-wide quality and occupancy (0..1). */
  targetBranches?: number;
  targetBranchKinds?: number;
  targetNetworkQuality?: number;
  targetNetworkOccupancy?: number;
}

export const BASIC_GROUPS: CareGroup[] = ['active_aging', 'stroke_rehab', 'bedridden'];
export const PROGRAMMES: CareGroup[] = ['dementia', 'tube_feeding', 'airway'];

export const CHAPTERS: ChapterDef[] = [
  { id: 1, days: 30, targetBeds: 10, targetResidents: 8, targetQuality: 70, groups: BASIC_GROUPS },
  // Programmes are half as common as the basic groups on the waiting list.
  { id: 2, days: 60, targetBeds: 30, targetResidents: 24, targetQuality: 75, targetRn: 3, programmes: PROGRAMMES, groups: [...BASIC_GROUPS, ...BASIC_GROUPS, ...PROGRAMMES] },
  // Tranquila Senior Living: villas on the newly bought land, premium residents, a garden worth living in.
  { id: 3, days: 60, targetBeds: 36, targetResidents: 30, targetQuality: 75, targetPremium: 4, targetPremiumSat: 78, targetAppeal: 20, groups: [...BASIC_GROUPS, ...BASIC_GROUPS, ...PROGRAMMES] },
  // Home Care: staff visit clients at home by van, while the home stays full and well run.
  { id: 4, days: 60, targetBeds: 36, targetResidents: 30, targetQuality: 75, targetClients: 12, targetVisitRate: 0.9, groups: [...BASIC_GROUPS, ...BASIC_GROUPS, ...PROGRAMMES] },
  // Healthcare Workforce: a training centre certifies staff, and partner organisations hire them by the day.
  { id: 5, days: 60, targetBeds: 36, targetResidents: 30, targetQuality: 75, targetCertified: 6, targetContracts: 6, groups: [...BASIC_GROUPS, ...BASIC_GROUPS, ...PROGRAMMES] },
  // Neuro Hospital: an outpatient clinic with a neurologist, and a short-stay stroke unit it refers to.
  { id: 6, days: 60, targetBeds: 36, targetResidents: 30, targetQuality: 75, targetConsults: 500, targetConsultRate: 0.9, targetDischarges: 25, groups: [...BASIC_GROUPS, ...BASIC_GROUPS, ...PROGRAMMES] },
  // Healthcare Empire: branch sites across the city, managed from headquarters and referring to each other.
  { id: 7, days: 60, targetBeds: 36, targetResidents: 30, targetQuality: 75, targetBranches: 3, targetBranchKinds: 3, targetNetworkQuality: 70, targetNetworkOccupancy: 0.7, groups: [...BASIC_GROUPS, ...BASIC_GROUPS, ...PROGRAMMES] },
];

/** Share of new waiting-list candidates who want a villa, once villas are unlocked (Chapter 3+). */
export const PREMIUM_SHARE = 30;
/** Buying the neighbouring plot (Chapter 3): new lot width and price. */
export const EXPANDED_WIDTH = 32;
export const LAND_PRICE = thb(300_000);

/** Chapters shown on the road map (the rest unlock in later versions). */
export const ROADMAP_CHAPTERS = 7;

export function chapterDef(id: number): ChapterDef {
  return CHAPTERS[Math.min(Math.max(id, 1), CHAPTERS.length) - 1];
}
