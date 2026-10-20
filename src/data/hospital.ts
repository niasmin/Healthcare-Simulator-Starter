import { thb } from '../domain/money';

/**
 * Chapter 6 catalogue: the neuro clinic (OPD) and the stroke unit (IPD). Work is abstract:
 * a consultation, a nursing round and a doctor's round, each with the qualification it needs.
 * ALL FEES AND COSTS ARE FICTIONAL GAME BALANCING, not real hospital tariffs.
 */

/** Appointment times per examination desk (minute of day), inside the morning shift. */
export const CONSULT_SLOTS = [9 * 60, 9 * 60 + 40, 10 * 60 + 20, 11 * 60, 13 * 60, 13 * 60 + 40];
/** With a lower reputation, only this many of the slots are booked. */
export const LOW_REP_SLOTS = 4;
export const LOW_REP_LINE = 60;
export const CONSULT_MINUTES = 30;
/** A patient waits this long past the appointment, then leaves. */
export const CONSULT_GRACE = 60;
export const CONSULT_FEE = thb(1_200);

/** Share of consultations (percent) that end in a stroke-unit referral. */
export const REFERRAL_PERCENT = 20;
export const REFERRAL_WAIT_DAYS = 2;
export const STAY_DAYS: [number, number] = [5, 8];

/** Nursing rounds every four hours (vital signs), and one doctor's round each morning. */
export const NURSE_ROUNDS = [2 * 60, 6 * 60, 10 * 60, 14 * 60, 18 * 60, 22 * 60];
export const NURSE_ROUND_MINUTES = 15;
export const DOCTOR_ROUND = 8 * 60;
export const DOCTOR_ROUND_MINUTES = 20;
export const ROUND_GRACE = 90;
export const DOCTOR_ROUND_GRACE = 180;
/** A stay with more missed rounds than this ends as "complicated" and costs reputation. */
export const MAX_MISSED_ROUNDS = 2;

/** Stroke-unit fee per day of stay, billed at discharge; daily supplies per inpatient. */
export const IPD_FEE_PER_DAY = thb(5_500);
export const IPD_SUPPLIES_PER_DAY = thb(600);
/** Share of smooth discharges (percent) whose families then ask for a place in the home's rehab ward. */
export const REHAB_TRANSFER_PERCENT = 50;

/** Pseudo-client for the daily outpatient invoice. */
export const OPD_CLIENT = { id: 'opd', name: { th: 'ผู้ป่วยนอก (OPD)', en: 'Outpatients (OPD)' } };
