import { thb } from '../domain/money';
import type { PersonName, ShiftSlot, Skill, StaffRole } from '../domain/types';

/** Staff roles. Wages are FICTIONAL game-balancing values (THB per month). */
export interface RoleDef {
  role: StaffRole;
  skills: Skill[];
  baseWageSatang: number;
  /** Extra monthly wage per year of experience. */
  wagePerYearSatang: number;
  color: number;
  cssColor: string;
}

export const ROLES: Record<StaffRole, RoleDef> = {
  rn: {
    role: 'rn',
    skills: ['assessment', 'vital_signs', 'med_round', 'personal_care', 'feeding', 'tube_feeding', 'airway_care'],
    baseWageSatang: thb(30_000),
    wagePerYearSatang: thb(1_000),
    color: 0x2f6f68,
    cssColor: '#2f6f68',
  },
  pn: {
    role: 'pn',
    skills: ['vital_signs', 'med_round', 'personal_care', 'feeding', 'tube_feeding'],
    baseWageSatang: thb(19_000),
    wagePerYearSatang: thb(600),
    color: 0x4a6aa5,
    cssColor: '#4a6aa5',
  },
  caregiver: {
    role: 'caregiver',
    skills: ['personal_care', 'feeding'],
    baseWageSatang: thb(14_000),
    wagePerYearSatang: thb(400),
    color: 0x5aa39a,
    cssColor: '#3f8f86',
  },
  pt: {
    role: 'pt',
    skills: ['mobility'],
    baseWageSatang: thb(28_000),
    wagePerYearSatang: thb(900),
    color: 0x6b8f4e,
    cssColor: '#5f8445',
  },
  ot: {
    role: 'ot',
    skills: ['activity'],
    baseWageSatang: thb(26_000),
    wagePerYearSatang: thb(800),
    color: 0xc9822b,
    cssColor: '#b5741f',
  },
  // Chapter 6: a neurologist sees clinic patients and does the daily stroke-unit round.
  doctor: {
    role: 'doctor',
    skills: ['consult'],
    baseWageSatang: thb(75_000),
    wagePerYearSatang: thb(2_500),
    color: 0x34495e,
    cssColor: '#34495e',
  },
};

export const ROLE_ORDER: StaffRole[] = ['doctor', 'rn', 'pn', 'caregiver', 'pt', 'ot'];

export function wageFor(role: StaffRole, experienceYears: number): number {
  const d = ROLES[role];
  return d.baseWageSatang + d.wagePerYearSatang * experienceYears;
}

/** Standard 8-hour shifts (minute of day). */
export const SHIFT_SLOTS: Record<ShiftSlot, { start: number; end: number }> = {
  morning: { start: 7 * 60, end: 15 * 60 },
  afternoon: { start: 15 * 60, end: 23 * 60 },
  night: { start: 23 * 60, end: 7 * 60 },
};
export const SLOT_ORDER: ShiftSlot[] = ['morning', 'afternoon', 'night'];

/** An employee may work at most this many minutes per rolling day (double shift). */
export const MAX_DAILY_SHIFT_MINUTES = 16 * 60;

/** Fictional staff names (Thai, with romanisation). */
export const STAFF_NAMES: PersonName[] = [
  { th: 'นภัส', en: 'Napat' },
  { th: 'ปวีณา', en: 'Paweena' },
  { th: 'กิตติ', en: 'Kitti' },
  { th: 'ธนพร', en: 'Thanaporn' },
  { th: 'ศิริพร', en: 'Siriporn' },
  { th: 'อนุชา', en: 'Anucha' },
  { th: 'วรรณา', en: 'Wanna' },
  { th: 'ชนิดา', en: 'Chanida' },
  { th: 'ณัฐพล', en: 'Nattapon' },
  { th: 'พิมพ์ชนก', en: 'Pimchanok' },
  { th: 'สุภาพร', en: 'Supaporn' },
  { th: 'ธีรวัฒน์', en: 'Teerawat' },
  { th: 'กมลชนก', en: 'Kamonchanok' },
  { th: 'ปิยะ', en: 'Piya' },
  { th: 'เบญจมาศ', en: 'Benjamas' },
  { th: 'อรุณี', en: 'Arunee' },
  { th: 'จิราพร', en: 'Jiraporn' },
  { th: 'วีระ', en: 'Weera' },
  { th: 'มยุรี', en: 'Mayuree' },
  { th: 'ภานุ', en: 'Phanu' },
];
