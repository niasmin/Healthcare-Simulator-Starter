import { thb } from '../domain/money';
import type { CourseId, PersonName, Skill, StaffRole, WorkforceOffer } from '../domain/types';

/**
 * Chapter 5 catalogue: training courses and partner organisations. Courses are abstract
 * qualifications (who may do which kind of task), never clinical instruction.
 * ALL PRICES AND RATES ARE FICTIONAL GAME BALANCING.
 */
export interface CourseDef {
  id: CourseId;
  /** Roles that may take the course. */
  roles: StaffRole[];
  costSatang: number;
  /** Class time, attended during the trainee's shift (or 08:00–16:00 for staff without shifts). */
  minutes: number;
  /** Qualification added when the course is passed, if any. */
  skill?: Skill;
}

export const COURSES: Record<CourseId, CourseDef> = {
  care_cert: { id: 'care_cert', roles: ['caregiver'], costSatang: thb(6_000), minutes: 480 },
  tube_cert: { id: 'tube_cert', roles: ['caregiver'], costSatang: thb(8_000), minutes: 480, skill: 'tube_feeding' },
  airway_cert: { id: 'airway_cert', roles: ['pn'], costSatang: thb(12_000), minutes: 480, skill: 'airway_care' },
};
export const COURSE_ORDER: CourseId[] = ['care_cert', 'tube_cert', 'airway_cert'];

/** Daily rate a partner pays per placed staff member, by role; certified requests pay 25% more. */
export const PLACEMENT_RATE: Record<StaffRole, number> = {
  caregiver: thb(1_100),
  pn: thb(1_700),
  rn: thb(2_600),
  pt: thb(2_300),
  ot: thb(2_100),
  doctor: thb(9_000),
  pharmacist: thb(2_200),
  nutritionist: thb(1_500),
  cleaner: thb(800),
  receptionist: thb(1_000),
  security: thb(900),
  accountant: thb(2_000),
};
export const CERT_PREMIUM_PERCENT = 25;

/** Placed staff work at the partner 07:00–15:00 on every contract day. */
export const PLACEMENT_START = 7 * 60;
export const PLACEMENT_MINUTES = 8 * 60;
export const PLACEMENT_DAYS = [7, 10, 14];
/** Offers stay open this many days; at most this many wait at once. */
export const OFFER_DAYS = 4;
export const MAX_OFFERS = 4;

/** Fictional partner organisations. */
export const PARTNERS: Array<{ name: PersonName; kind: WorkforceOffer['orgKind'] }> = [
  { name: { th: 'คลินิกชุมชนสุขใจ', en: 'Sukjai Community Clinic' }, kind: 'clinic' },
  { name: { th: 'โรงพยาบาลเมืองเหนือ', en: 'Mueang Nuea Hospital' }, kind: 'hospital' },
  { name: { th: 'บริษัท ไทยรุ่งเรือง จำกัด', en: 'Thai Rungruang Co.' }, kind: 'company' },
  { name: { th: 'โรงเรียนบ้านดอยงาม', en: 'Ban Doi Ngam School' }, kind: 'school' },
  { name: { th: 'ศูนย์สุขภาพชุมชนหนองหอย', en: 'Nong Hoi Health Centre' }, kind: 'clinic' },
  { name: { th: 'โรงพยาบาลเอกชนลานนา', en: 'Lanna Private Hospital' }, kind: 'hospital' },
  { name: { th: 'นิคมอุตสาหกรรมสันทราย', en: 'San Sai Industrial Park' }, kind: 'company' },
  { name: { th: 'หอพักผู้สูงอายุบ้านสวน', en: 'Ban Suan Senior Residence' }, kind: 'clinic' },
];

/** Who partners ask for (weights). */
export const OFFER_ROLES: Array<[StaffRole, number]> = [
  ['caregiver', 55],
  ['pn', 30],
  ['rn', 15],
];
/** Certificate a request may require, by role, and how often (percent). */
export const OFFER_CERT: Partial<Record<StaffRole, { cert: CourseId; chance: number }>> = {
  caregiver: { cert: 'care_cert', chance: 50 },
  pn: { cert: 'airway_cert', chance: 35 },
};
