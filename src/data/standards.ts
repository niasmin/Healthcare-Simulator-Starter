import { thb } from '../domain/money';
import type { StaffRole, StandardId } from '../domain/types';

/**
 * Licensing standards mode ("มาตรฐาน สบส."): an optional rule set modelled on the Thai ministerial
 * regulation for elderly-care businesses (กฎกระทรวง กำหนดมาตรฐานด้านสถานที่ ความปลอดภัย และการให้บริการ
 * ในสถานประกอบการเพื่อสุขภาพประเภทกิจการการดูแลผู้สูงอายุหรือผู้มีภาวะพึ่งพิง พ.ศ. 2563).
 *
 * Each check below names the clause it is drawn from and folds it into something the game can
 * see (a room, a shift, a purchase, a date). The only number taken from the regulation is the
 * carer ratio of ข้อ 8 (one carer for at most five residents, for overnight care); the game reads
 * it as carers on the roster, since the clause does not say per shift. Costs, fines, the inspection
 * calendar and the reputation effects are FICTIONAL GAME BALANCING, not real penalties, and none of
 * this is legal advice.
 */
export interface StandardDef {
  id: StandardId;
  icon: string;
  /** The clause of the 2563 regulation the check is drawn from. */
  clause: string;
}

export const STANDARDS: StandardDef[] = [
  { id: 'ratio', icon: '👥', clause: 'ข้อ 8' },
  { id: 'night_watch', icon: '🌙', clause: 'ข้อ 6 (11)(ง)' },
  { id: 'coordination', icon: '📟', clause: 'ข้อ 2' },
  { id: 'common_area', icon: '🪑', clause: 'ข้อ 1 (3)(ง)' },
  { id: 'bathroom', icon: '🚿', clause: 'ข้อ 1 (9)' },
  { id: 'safety_kit', icon: '🧯', clause: 'ข้อ 4 (1)(4), ข้อ 5' },
  { id: 'drill', icon: '🫀', clause: 'ข้อ 4 (6)(8)' },
  { id: 'assessment', icon: '📋', clause: 'ข้อ 6 (2)' },
  { id: 'team', icon: '🤝', clause: 'ข้อ 7, ข้อ 8' },
];

/** ข้อ 8: one carer looks after at most this many residents. */
export const RESIDENTS_PER_CARER = 5;
/** Who counts as a carer ("ผู้ให้บริการ") for the ratio and the night watch. */
export const CARER_ROLES: StaffRole[] = ['rn', 'pn', 'caregiver'];
/** ข้อ 7–8: the multidisciplinary team, any one of these on the staff. */
export const TEAM_ROLES: StaffRole[] = ['pt', 'ot', 'doctor', 'nutritionist', 'pharmacist'];
/** ข้อ 6 (2): residents are assessed on admission and again every three months. */
export const REASSESS_DAYS = 90;
/** ข้อ 4 (6)(8): fire and CPR training at least once a year. */
export const DRILL_VALID_DAYS = 365;

/** Fictional prices: first-aid kit and manual, extinguishers, emergency lights, a resuscitation bag and an AED. */
export const SAFETY_KIT_SATANG = thb(60_000);
/** Fictional trainer fee for the yearly fire drill and CPR refresher. */
export const DRILL_SATANG = thb(8_000);

/** A new licence gets this many days before the first inspection; then one every so many days. */
export const FIRST_INSPECTION_DAYS = 14;
export const INSPECTION_EVERY_DAYS = 30;
/** The home hears of a visit this many days ahead. */
export const INSPECTION_NOTICE_DAYS = 3;
/** After a failed visit the inspector comes back this many days later. */
export const FOLLOW_UP_DAYS = 7;
/** Fictional fine per check still failing at the follow-up visit. */
export const FINE_PER_ITEM_SATANG = thb(10_000);
export const PASS_REPUTATION = 2;
export const FINE_REPUTATION = 3;
/** Inspection reports kept. */
export const INSPECTIONS_KEPT = 6;
