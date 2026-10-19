import type { CareGroup } from '../domain/types';

/**
 * Campaign chapters (concept-art road map). Each one is judged once by the engine when its last day
 * closes. Targets are FICTIONAL game balancing. Chapters 3–7 are listed in the UI but not playable yet.
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
}

export const BASIC_GROUPS: CareGroup[] = ['active_aging', 'stroke_rehab', 'bedridden'];
export const PROGRAMMES: CareGroup[] = ['dementia', 'tube_feeding', 'airway'];

export const CHAPTERS: ChapterDef[] = [
  { id: 1, days: 30, targetBeds: 10, targetResidents: 8, targetQuality: 70, groups: BASIC_GROUPS },
  // Programmes are half as common as the basic groups on the waiting list.
  { id: 2, days: 60, targetBeds: 30, targetResidents: 24, targetQuality: 75, targetRn: 3, programmes: PROGRAMMES, groups: [...BASIC_GROUPS, ...BASIC_GROUPS, ...PROGRAMMES] },
];

/** Chapters shown on the road map (the rest unlock in later versions). */
export const ROADMAP_CHAPTERS = 7;

export function chapterDef(id: number): ChapterDef {
  return CHAPTERS[Math.min(Math.max(id, 1), CHAPTERS.length) - 1];
}
