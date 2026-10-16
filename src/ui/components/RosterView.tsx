import { ROLE_PORTRAIT } from '../portraits';
import { useMemo, useState } from 'react';
import { ROLES, ROLE_ORDER, SHIFT_SLOTS, SLOT_ORDER } from '../../data/staff';
import { slotAt } from '../../domain/rules/shifts';
import type { Employee, ShiftSlot, StaffRole } from '../../domain/types';
import { rosterView, staffActivity } from '../../sim/selectors';
import { formatClock } from '../../sim/systems/time';
import { useIsMobile, useMoney, useT } from '../hooks';
import { useGame } from '../store';
import { Avatar, RoleChip, StatBar, useName } from './people';

function hours(slot: ShiftSlot) {
  const w = SHIFT_SLOTS[slot];
  return `${formatClock(w.start)}–${formatClock(w.end)}`;
}

function AddPopover({ role, slot, onClose }: { role: StaffRole; slot: ShiftSlot; onClose: () => void }) {
  const t = useT();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  // Staff with the fewest shifts first, so filling a column spreads work instead of stacking double shifts.
  const shiftCount = (id: string) => game.shifts.filter((s) => s.employeeId === id).length;
  const options = game.employees
    .filter((e) => e.role === role && !game.shifts.some((s) => s.employeeId === e.id && s.slot === slot))
    .sort((a, b) => shiftCount(a.id) - shiftCount(b.id));
  return (
    <div className="absolute z-20 left-0 top-full mt-1 w-60 max-lg:fixed max-lg:inset-x-3 max-lg:top-auto max-lg:bottom-24 max-lg:w-auto max-lg:max-h-[50dvh] max-lg:overflow-y-auto rounded-xl border border-line bg-white shadow-2xl p-2 flex flex-col gap-1" role="dialog">
      <div className="text-[11px] font-semibold text-ink-soft px-1">{t('roster.pick', { role: `${role}.short`, slot })}</div>
      {options.length === 0 && <p className="text-xs text-ink-soft px-1 py-1 leading-snug">{t('roster.no_staff', { role: `${role}.short` })}</p>}
      {options.map((e) => {
        const mine = game.shifts.filter((s) => s.employeeId === e.id).map((s) => t(`slot.${s.slot}`));
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              dispatch({ type: 'assignShift', employeeId: e.id, slot });
              onClose();
            }}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-sand"
          >
            <Avatar src={ROLE_PORTRAIT[e.role]} name={e.name} color={ROLES[e.role].cssColor} size={26} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate">{name(e.name, true)}</span>
              <span className="block text-[10px] text-ink-soft">{mine.length ? mine.join(' + ') : t('roster.no_shift')}</span>
            </span>
          </button>
        );
      })}
      <button type="button" onClick={onClose} className="text-[11px] text-ink-soft self-end px-1">
        ✕
      </button>
    </div>
  );
}

function StaffRow({ e }: { e: Employee }) {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [confirm, setConfirm] = useState(false);
  const act = staffActivity(game, e);
  const slots = game.shifts.filter((s) => s.employeeId === e.id).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  let status = t('roster.off');
  let tone = 'text-ink-soft';
  if (act.kind === 'idle') {
    status = t('roster.idle');
    tone = 'text-ok';
  } else if (act.kind === 'busy') {
    const r = game.residents.find((x) => x.id === act.residentId);
    status = t('roster.busy', { task: act.taskKind, name: r ? name(r.name, true) : '' });
    tone = 'text-teal';
  }
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar src={ROLE_PORTRAIT[e.role]} name={e.name} color={ROLES[e.role].cssColor} size={28} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{name(e.name, true)}</div>
            <RoleChip role={e.role} label={t(`role.${e.role}.short`)} />
          </div>
        </div>
      </td>
      <td className="py-1.5 pr-2 text-xs whitespace-nowrap">{slots.length ? slots.map((s) => t(`slot.${s.slot}`)).join(' + ') : <span className="text-warn">{t('roster.no_shift')}</span>}</td>
      <td className="py-1.5 pr-2 w-24">
        <StatBar value={e.energy} color="#2f9e9a" />
        <div className="text-[10px] tabular text-ink-soft">{Math.round(e.energy)}</div>
      </td>
      <td className="py-1.5 pr-2 w-24">
        <StatBar value={e.morale} color="#8a5a9e" />
        <div className="text-[10px] tabular text-ink-soft">{Math.round(e.morale)}</div>
      </td>
      <td className={`py-1.5 pr-2 text-xs ${tone}`}>{status}</td>
      <td className="py-1.5 pr-2 text-xs tabular whitespace-nowrap">{money(e.wageMonthlySatang)}</td>
      <td className="py-1.5 text-right">
        <button
          type="button"
          onClick={() => {
            if (confirm) dispatch({ type: 'dismissStaff', employeeId: e.id });
            setConfirm(!confirm);
          }}
          onBlur={() => setConfirm(false)}
          className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${confirm ? 'bg-bad text-white' : 'text-ink-soft hover:text-bad'}`}
        >
          {confirm ? t('roster.dismiss_sure') : t('roster.dismiss')}
        </button>
      </td>
    </tr>
  );
}

export function RosterView() {
  const t = useT();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const view = useMemo(() => rosterView(game), [game]);
  const [open, setOpen] = useState<string | null>(null);
  const current = slotAt(game.minute);
  // Phones show one shift column at a time.
  const mobile = useIsMobile();
  const [pickedSlot, setPickedSlot] = useState<ShiftSlot | null>(null);
  const mSlot = pickedSlot ?? current;
  const slots = mobile ? [mSlot] : SLOT_ORDER;

  return (
    <div className="p-3 flex flex-col gap-4">
      <section className="rounded-2xl bg-white border border-line p-3 overflow-x-auto">
        <h2 className="font-bold text-base mb-2">{t('roster.title')}</h2>
        {mobile && (
          <div className="grid grid-cols-3 gap-1 mb-1" role="tablist">
            {SLOT_ORDER.map((slot) => (
              <button
                key={slot}
                type="button"
                role="tab"
                aria-selected={mSlot === slot}
                onClick={() => setPickedSlot(slot)}
                className={`rounded-lg py-2 text-sm ${mSlot === slot ? 'bg-ink text-white font-semibold' : 'bg-sand text-ink-soft'}`}
              >
                {t(`slot.${slot}`)}
                {slot === current ? ' •' : ''}
              </button>
            ))}
          </div>
        )}
        <table className="w-full lg:min-w-[560px] border-separate border-spacing-1.5 text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold text-ink-soft w-20 lg:w-24">{t('roster.role')}</th>
              {slots.map((slot) => (
                <th key={slot} className={`text-center rounded-lg py-1.5 ${slot === current ? 'bg-teal text-white' : 'bg-sand text-ink'}`}>
                  <div className="font-semibold">{t(`slot.${slot}`)}</div>
                  <div className="text-[10px] font-normal opacity-80 tabular">
                    {hours(slot)}
                    {slot === current ? ` · ${t('roster.now')}` : ''}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_ORDER.map((role) => (
              <tr key={role}>
                <th className="text-left align-middle">
                  <RoleChip role={role} label={t(`role.${role}.short`)} />
                </th>
                {slots.map((slot) => {
                  const cell = view.cells.find((c) => c.role === role && c.slot === slot)!;
                  const key = `${role}-${slot}`;
                  const short = cell.staff.length < cell.need;
                  return (
                    <td key={slot} className={`relative align-top rounded-lg border p-1.5 ${short ? 'border-bad/50 bg-bad/5' : 'border-line bg-paper'}`}>
                      <div className="flex flex-wrap items-center gap-1 min-h-7">
                        {cell.staff.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            title={`${name(e.name, true)} · ${t('roster.remove_hint')}`}
                            onClick={() => dispatch({ type: 'unassignShift', employeeId: e.id, slot })}
                            className="rounded-full focus-visible:outline-2 focus-visible:outline-teal"
                          >
                            <Avatar src={ROLE_PORTRAIT[e.role]} name={e.name} color={ROLES[e.role].cssColor} size={28} ring />
                          </button>
                        ))}
                        <button
                          type="button"
                          aria-label={t('roster.pick', { role: `${role}.short`, slot })}
                          onClick={() => setOpen(open === key ? null : key)}
                          className="size-7 rounded-full border border-dashed border-ink-soft/40 text-ink-soft hover:border-teal hover:text-teal"
                        >
                          +
                        </button>
                        <span className={`ml-auto text-[11px] tabular font-semibold ${short ? 'text-bad' : cell.need ? 'text-ok' : 'text-ink-soft/60'}`}>
                          {cell.staff.length}/{cell.need}
                        </span>
                      </div>
                      {open === key && <AddPopover role={role} slot={slot} onClose={() => setOpen(null)} />}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th />
              {view.slots.filter((s) => slots.includes(s.slot)).map((s) => {
                const wl = Number.isFinite(s.workload) ? Math.round(s.workload * 100) : null;
                const hasDemand = s.needCount > 0 || s.missingSkills.length > 0;
                return (
                  <td key={s.slot} className="align-top rounded-lg bg-sand/60 p-2">
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div>
                        <div className="text-lg font-bold tabular leading-none">{s.staffCount}</div>
                        <div className="text-[10px] text-ink-soft">{t('roster.staff')}</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold tabular leading-none">{s.needCount}</div>
                        <div className="text-[10px] text-ink-soft">{t('roster.need')}</div>
                      </div>
                      <div>
                        <div className={`text-lg font-bold tabular leading-none ${wl === null || wl > 90 ? 'text-bad' : wl > 75 ? 'text-warn' : ''}`}>{wl === null ? '—' : `${wl}%`}</div>
                        <div className="text-[10px] text-ink-soft">{t('roster.workload')}</div>
                      </div>
                    </div>
                    <div className={`mt-1.5 text-[11px] leading-snug rounded-md px-1.5 py-1 ${!hasDemand ? 'text-ink-soft' : s.ready ? 'bg-ok/12 text-ok' : 'bg-bad/10 text-bad'}`}>
                      {!hasDemand
                        ? t('roster.idle_slot')
                        : s.ready
                          ? `✓ ${t('roster.ready')}`
                          : [s.missingRn ? t('roster.missing_rn') : '', s.missingSkills.length ? t('roster.missing_skills', { skills: s.missingSkills.map((k) => t(`skill.${k}`)).join(', ') }) : '']
                              .filter(Boolean)
                              .join(' · ')}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
        <p className="text-[10px] text-ink-soft/80 mt-1">{t('roster.legend')}</p>
      </section>

      <section className="rounded-2xl bg-white border border-line p-3 overflow-x-auto">
        <h2 className="font-bold text-base mb-1">{t('roster.staff_list')}</h2>
        {game.employees.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('roster.empty')}</p>
        ) : (
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="text-[11px] text-ink-soft">
                <th className="font-medium py-1">{t('roster.staff')}</th>
                <th className="font-medium">{t('view.roster')}</th>
                <th className="font-medium">{t('roster.energy')}</th>
                <th className="font-medium">{t('roster.morale')}</th>
                <th className="font-medium">{t('inspector.status')}</th>
                <th className="font-medium">{t('roster.wage')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {game.employees.map((e) => (
                <StaffRow key={e.id} e={e} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
