import type { Employee, Needs, PersonName, StaffRole } from '../domain/types';

/**
 * Character portraits from the project's chibi character sheet (fictional characters).
 * Each character has five expressions; the UI picks one from the person's live mood.
 */
const faces = import.meta.glob('../assets/faces/*.png', { eager: true, import: 'default' }) as Record<string, string>;

export type Mood = 'default' | 'smile' | 'happy' | 'surprise' | 'sad';
type FaceSet = 'owner_f' | 'owner_m' | 'nurse' | 'caregiver' | 'pt' | 'ot' | 'resident' | 'doctor' | 'pharmacist' | 'nutritionist' | 'cleaner' | 'receptionist' | 'security' | 'accountant' | 'elder_f';

const ROLE_FACE: Record<StaffRole, FaceSet> = { rn: 'nurse', pn: 'nurse', caregiver: 'caregiver', pt: 'pt', ot: 'ot', doctor: 'doctor', pharmacist: 'pharmacist', nutritionist: 'nutritionist', cleaner: 'cleaner', receptionist: 'receptionist', security: 'security', accountant: 'accountant' };

function face(set: FaceSet, mood: Mood): string {
  return faces[`../assets/faces/${set}_${mood}.png`];
}

/** 0..100 → expression. */
export function moodOf(value: number): Mood {
  return value >= 80 ? 'happy' : value >= 65 ? 'smile' : value >= 45 ? 'default' : 'sad';
}

export function rolePortrait(role: StaffRole, mood: Mood = 'default'): string {
  return face(ROLE_FACE[role], mood);
}

/** Staff look tired when exhausted, otherwise as their morale. */
export function staffPortrait(e: Employee): string {
  return rolePortrait(e.role, e.energy < 20 ? 'sad' : moodOf(e.morale));
}


/** Residents use the chibi elders: the grandfather with live expressions, the grandmother (one expression so far). */
export function residentPortrait(name: PersonName, needs?: Needs, mood?: Mood): string {
  const m = mood ?? (needs ? moodOf((needs.happiness + needs.satisfaction) / 2) : 'default');
  return face(name.gender === 'm' ? 'resident' : 'elder_f', m);
}
