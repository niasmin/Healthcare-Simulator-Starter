import { thb } from '../domain/money';
import type { EventDefId } from '../domain/types';

/**
 * Event catalogue (GDD §10 and concept art step 9). All scenarios are fictional,
 * abstract and non-diagnostic: they describe management decisions, never treatment.
 * Text lives in i18n under `event.<id>.*`; effects live in sim/systems/events.ts.
 */
export interface ChoiceDef {
  id: string;
  /** One-off cost charged to the 'event' ledger category. */
  costSatang: number;
  /** Shown as a warning badge (needs an RN on duty right now, etc.). */
  requires?: 'rn_on_shift';
}

export interface EventDef {
  id: EventDefId;
  /** Earliest day it can happen. */
  minDay: number;
  weight: number;
  cooldownDays: number;
  /** Visual tone for the event card. */
  tone: 'urgent' | 'staff' | 'opportunity' | 'family';
  choices: ChoiceDef[];
  /** Applied when the player lets the event expire. */
  defaultChoice: string;
}

export const EVENT_DEFS: Record<EventDefId, EventDef> = {
  resident_change: {
    id: 'resident_change',
    minDay: 3,
    weight: 3,
    cooldownDays: 6,
    tone: 'urgent',
    choices: [
      { id: 'assess', costSatang: 0, requires: 'rn_on_shift' },
      { id: 'refer', costSatang: thb(8_000) },
      { id: 'monitor', costSatang: 0 },
    ],
    defaultChoice: 'monitor',
  },
  staff_resign: {
    id: 'staff_resign',
    minDay: 5,
    weight: 2,
    cooldownDays: 14,
    tone: 'staff',
    choices: [
      { id: 'raise', costSatang: 0 },
      { id: 'bonus', costSatang: thb(10_000) },
      { id: 'accept', costSatang: 0 },
    ],
    defaultChoice: 'accept',
  },
  referral: {
    id: 'referral',
    minDay: 5,
    weight: 2,
    cooldownDays: 12,
    tone: 'opportunity',
    choices: [
      { id: 'accept_all', costSatang: 0 },
      { id: 'accept_beds', costSatang: 0 },
      { id: 'decline', costSatang: 0 },
    ],
    defaultChoice: 'decline',
  },
  family_visit: {
    id: 'family_visit',
    minDay: 3,
    weight: 3,
    cooldownDays: 5,
    tone: 'family',
    choices: [
      { id: 'special', costSatang: thb(5_000) },
      { id: 'standard', costSatang: 0 },
      { id: 'postpone', costSatang: 0 },
    ],
    defaultChoice: 'postpone',
  },
};

/**
 * Chapter 1 teaching script: each event fires at 09:00 on its day, or on the first later day it is
 * allowed (eligible, off cooldown, quiet gap respected), within a few days. Random events fill the rest.
 */
export const SCRIPTED_EVENTS: Array<{ day: number; defId: EventDefId }> = [
  { day: 3, defId: 'family_visit' },
  { day: 8, defId: 'resident_change' },
  { day: 15, defId: 'staff_resign' },
];
/** A scripted event that could not fire by this many days after its day is dropped. */
export const SCRIPT_WINDOW_DAYS = 5;

export const EVENT_ORDER: EventDefId[] = ['resident_change', 'staff_resign', 'referral', 'family_visit'];

/** Chance (percent) that an event fires at the 09:00 check when none is active. */
export const DAILY_EVENT_CHANCE = 30;
/** Quiet days required after any event before the next one can fire. */
export const MIN_DAYS_BETWEEN_EVENTS = 3;
/** Unanswered events resolve with their default after this many minutes of game time. */
export const EVENT_EXPIRY_MINUTES = 12 * 60;
export const REFERRAL_COUNT = 10;
export const REFERRAL_DAYS = 10;
