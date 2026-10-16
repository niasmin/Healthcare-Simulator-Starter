import type { PersonName, StaffRole } from '../domain/types';
import caregiver from '../assets/portraits/caregiver.jpg';
import ceo from '../assets/portraits/ceo.jpg';
import ot from '../assets/portraits/ot.jpg';
import pn from '../assets/portraits/pn.jpg';
import pt from '../assets/portraits/pt.jpg';
import residentF from '../assets/portraits/resident_f.jpg';
import residentF2 from '../assets/portraits/resident_f2.jpg';
import residentM from '../assets/portraits/resident_m.jpg';
import rn from '../assets/portraits/rn.jpg';

/** Character portraits cropped from the project's concept art (fictional characters). */
export const ROLE_PORTRAIT: Record<StaffRole, string> = { rn, pn, caregiver, pt, ot };
export const CEO_PORTRAIT = ceo;

export function residentPortrait(name: PersonName): string {
  if (name.gender === 'm') return residentM;
  let h = 0;
  for (const ch of name.th) h = (h + ch.charCodeAt(0)) % 97;
  return h % 2 ? residentF2 : residentF;
}
