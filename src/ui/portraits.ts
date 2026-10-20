import type { Employee, Needs, PersonName, StaffRole } from '../domain/types';
import residentF from '../assets/portraits/resident_f.jpg';
import residentF2 from '../assets/portraits/resident_f2.jpg';

/**
 * Character portraits from the project's chibi character sheet (fictional characters).
 * Each character has five expressions; the UI picks one from the person's live mood.
 */
const faces = import.meta.glob('../assets/faces/*.png', { eager: true, import: 'default' }) as Record<string, string>;

export type Mood = 'default' | 'smile' | 'happy' | 'surprise' | 'sad';
type FaceSet = 'owner_f' | 'owner_m' | 'nurse' | 'caregiver' | 'pt' | 'ot' | 'resident' | 'doctor' | 'pharmacist' | 'nutritionist' | 'cleaner';

const ROLE_FACE: Record<StaffRole, FaceSet> = { rn: 'nurse', pn: 'nurse', caregiver: 'caregiver', pt: 'pt', ot: 'ot', doctor: 'doctor', pharmacist: 'pharmacist', nutritionist: 'nutritionist', cleaner: 'cleaner' };

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


/** Male residents use the chibi elder with live expressions; female residents keep the earlier portraits. */
export function residentPortrait(name: PersonName, needs?: Needs, mood?: Mood): string {
  if (name.gender === 'm') return face('resident', mood ?? (needs ? moodOf((needs.happiness + needs.satisfaction) / 2) : 'default'));
  let h = 0;
  for (const ch of name.th) h = (h + ch.charCodeAt(0)) % 97;
  return h % 2 ? residentF2 : residentF;
}
