/**
 * A resident's day (looks, plus small family-visit effects). Times are minutes of the day; all
 * values are fictional game balancing. Who does what and when comes from a hash of the seed, the
 * day and the resident (never the PRNG), so the same game always plays the same day.
 */
/** Morning wash: residents who get about take turns in the bathroom, half an hour each. */
export const BATH_FROM = 6 * 60 + 30;
export const BATH_SLOTS = 5;
export const BATH_MINUTES = 30;
/** Morning group activity in the therapy room (for those not out walking). */
export const ACTIVITY_FROM = 9 * 60 + 30;
export const ACTIVITY_TO = 11 * 60;
/** After-lunch nap: everyone rests in bed. */
export const NAP_FROM = 13 * 60;
export const NAP_TO = 14 * 60 + 30;
/** Lights out: everyone in bed until morning. */
export const NIGHT_FROM = 20 * 60;
export const NIGHT_TO = 6 * 60;
/** Family visits: about one day in VISIT_EVERY for each resident, in the morning or afternoon visiting hours. */
export const VISIT_EVERY = 5;
export const VISIT_SLOTS = [10 * 60, 15 * 60 + 30];
export const VISIT_MINUTES = 90;
/** A family who find a resident's wellbeing below this on a visit leave worried and say so. */
export const VISIT_POOR_CARE = 45;
