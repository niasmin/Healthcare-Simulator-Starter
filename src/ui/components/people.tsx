import { ROLES } from '../../data/staff';
import type { CareGroup, PersonName, StaffRole } from '../../domain/types';
import { useGame } from '../store';

export const GROUP_COLOR: Record<CareGroup, string> = {
  active_aging: '#c9822b',
  stroke_rehab: '#4a6aa5',
  bedridden: '#8a5a9e',
};

/** First Thai consonant (skips leading vowels like เ แ โ) or first Latin letter. */
export function initialOf(name: PersonName, lang: 'th' | 'en'): string {
  if (lang === 'en') return name.en.charAt(0).toUpperCase();
  const m = name.th.match(/[ก-ฮ]/);
  return m ? m[0] : name.th.charAt(0);
}

export function useName() {
  const lang = useGame((s) => s.lang);
  return (name: PersonName, honorific = false) => (lang === 'th' ? `${honorific ? 'คุณ' : ''}${name.th}` : name.en);
}

export function Avatar({ name, color, size = 32, title, ring }: { name: PersonName; color: string; size?: number; title?: string; ring?: boolean }) {
  const lang = useGame((s) => s.lang);
  return (
    <span
      title={title}
      className={`inline-grid place-items-center rounded-full text-white font-semibold shrink-0 select-none ${ring ? 'ring-2 ring-white shadow-sm' : ''}`}
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.44), lineHeight: 1 }}
    >
      {initialOf(name, lang)}
    </span>
  );
}

export function RoleChip({ role, label }: { role: StaffRole; label: string }) {
  return (
    <span className="inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded-md text-white" style={{ background: ROLES[role].cssColor }}>
      {label}
    </span>
  );
}

/** Horizontal stat bar; turns amber/red when low so trouble is visible at a glance. */
export function StatBar({ value, color }: { value: number; color: string }) {
  const v = Math.max(0, Math.min(100, value));
  const fill = v < 25 ? 'var(--color-bad)' : v < 45 ? 'var(--color-warn)' : color;
  return (
    <div className="h-2 rounded-full bg-sand overflow-hidden" role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: fill }} />
    </div>
  );
}
