import type { AchievementId, MissionId } from '../domain/types';

/**
 * Daily missions (three a day, picked from the pool by the game's seed and the day) and one-off
 * achievements. Rewards are ⭐ stars, not cash, so the economy's balance is unchanged; stars count
 * towards the ranking score.
 * A mission marked `end` can only be judged when the day closes (e.g. "no care missed today").
 */
export interface MissionDef {
  id: MissionId;
  /** Stars. */
  reward: number;
  end?: boolean;
}
export const MISSIONS: Record<MissionId, MissionDef> = {
  no_missed: { id: 'no_missed', reward: 2, end: true },
  tasks40: { id: 'tasks40', reward: 1 },
  admit_one: { id: 'admit_one', reward: 1 },
  hire_one: { id: 'hire_one', reward: 1 },
  outing: { id: 'outing', reward: 1 },
  satisfied75: { id: 'satisfied75', reward: 1, end: true },
  happy70: { id: 'happy70', reward: 1, end: true },
  cash_up: { id: 'cash_up', reward: 1, end: true },
  full_beds: { id: 'full_beds', reward: 2 },
};
export const MISSION_ORDER = Object.keys(MISSIONS) as MissionId[];
export const MISSIONS_PER_DAY = 3;
/** All three missions done: a bonus on top. */
export const ALL_MISSIONS_BONUS = 1;
/** Town season (each game month): stars for finishing first, second or third in town. */
export const TROPHY_STARS = [15, 10, 5];

export interface AchievementDef {
  id: AchievementId;
  /** Stars. */
  reward: number;
  icon: string;
}
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_resident', reward: 2, icon: '🏠' },
  { id: 'full_ward', reward: 5, icon: '🛏️' },
  { id: 'beds30', reward: 10, icon: '🏢' },
  { id: 'beds60', reward: 20, icon: '🏙️' },
  { id: 'villas3', reward: 10, icon: '🏡' },
  { id: 'team20', reward: 10, icon: '👥' },
  { id: 'all_roles', reward: 20, icon: '🧑‍⚕️' },
  { id: 'perfect_day', reward: 5, icon: '✨' },
  { id: 'happy_week', reward: 15, icon: '💖' },
  { id: 'shopper', reward: 10, icon: '🛒' },
  { id: 'town_tour', reward: 5, icon: '🗺️' },
  { id: 'top_town', reward: 20, icon: '🏆' },
  { id: 'missions10', reward: 5, icon: '🎯' },
  { id: 'missions50', reward: 13, icon: '🎖️' },
];
