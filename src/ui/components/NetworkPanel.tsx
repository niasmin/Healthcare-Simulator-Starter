import { useState } from 'react';
import { staffPortrait } from '../portraits';
import { BRANCHES, BRANCH_ORDER, MAX_BRANCHES, SUPPORT_COST } from '../../data/network';
import { ROLES } from '../../data/staff';
import type { BranchKind } from '../../domain/types';
import { branchCapacity, branchDailyNet, managerBlocker, networkStats, openBlocker, qualityTarget } from '../../sim/systems/network';
import { dayOf } from '../../sim/systems/time';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';
import { Avatar, StatBar, useName } from './people';

import nursingArt from '../../assets/title/ic_nursing.png';
import homecareArt from '../../assets/title/ic_homecare.png';
import clinicArt from '../../assets/title/ic_neuro.png';

/** Branch pictures: the business-card art from the title-screen key art. */
const KIND_ART: Record<BranchKind, string> = { nursing: nursingArt, homecare: homecareArt, clinic: clinicArt };

/** Pick an employee who may manage this kind of branch (staff without shifts first). */
function ManagerSelect({ kind, value, onChange }: { kind: BranchKind; value: string; onChange: (id: string) => void }) {
  const t = useT();
  const name = useName();
  const game = useGame((s) => s.game);
  const options = game.employees
    .filter((e) => managerBlocker(game, kind, e.id) === null)
    .sort((a, b) => Number(game.shifts.some((s) => s.employeeId === a.id)) - Number(game.shifts.some((s) => s.employeeId === b.id)));
  if (!options.length) return <p className="text-[11px] text-warn">{t('net.no_manager', { roles: BRANCHES[kind].managers.map((r) => t(`role.${r}.short`)).join('/') })}</p>;
  return (
    <select value={value || options[0].id} onChange={(ev) => onChange(ev.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs" aria-label={t('net.manager')}>
      {options.map((e) => (
        <option key={e.id} value={e.id}>
          {name(e.name)} · {t(`role.${e.role}.short`)}
          {e.certs?.length ? ' 🎓' : ''}
          {game.shifts.some((s) => s.employeeId === e.id) ? ` · ${t('wf.leaves_roster')}` : ''}
        </option>
      ))}
    </select>
  );
}

function OpenRow({ kind }: { kind: BranchKind }) {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [pick, setPick] = useState('');
  const d = BRANCHES[kind];
  const eligible = game.employees.filter((e) => managerBlocker(game, kind, e.id) === null);
  const chosen = eligible.find((e) => e.id === pick) ?? eligible[0];
  const blocker = chosen ? openBlocker(game, kind, chosen.id) : null;
  const fullNet = d.capacity * (d.ratePerUnit - d.costPerUnit) - d.fixedPerDay;
  return (
    <div className="rounded-xl border border-line bg-white p-2 flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <img src={KIND_ART[kind]} alt="" className="h-9 w-11 object-contain shrink-0" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t(`net.kind.${kind}`)}</div>
          <div className="text-[11px] text-ink-soft leading-snug">
            {t(`net.cap.${kind}`, { n: d.capacity })} · {t('net.open_cost', { cost: money(d.capexSatang) })} · {t('net.full_net', { net: money(fullNet) })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <ManagerSelect kind={kind} value={chosen?.id ?? ''} onChange={setPick} />
        {chosen && (
          <button
            type="button"
            disabled={blocker !== null}
            title={blocker ? t(`reason.${blocker}`) : undefined}
            onClick={() => dispatch({ type: 'openBranch', kind, managerId: chosen.id })}
            className="px-2.5 py-1 rounded-lg bg-teal text-white text-xs font-semibold disabled:opacity-35"
          >
            {t('net.open')}
          </button>
        )}
      </div>
      {blocker && blocker !== 'not_found' && <p className="text-[10px] text-warn">{t(`reason.${blocker}`)}</p>}
    </div>
  );
}

function BranchCard({ id }: { id: string }) {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [confirm, setConfirm] = useState(false);
  const [pick, setPick] = useState('');
  const b = game.network.branches.find((x) => x.id === id)!;
  const m = b.managerId ? game.employees.find((e) => e.id === b.managerId) : undefined;
  const cap = branchCapacity(b);
  const net = branchDailyNet(b);
  const target = Math.round(qualityTarget(game, b));
  const ready = dayOf(game.minute) >= b.supportReadyDay;
  return (
    <div className={`rounded-xl border p-2 flex flex-col gap-1.5 ${b.quality < 50 ? 'border-warn/50 bg-warn/5' : 'border-line bg-white'}`}>
      <div className="flex items-center gap-2">
        <img src={KIND_ART[b.kind]} alt="" className="h-9 w-11 object-contain shrink-0" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{name(b.name)}</div>
          <div className="text-[11px] text-ink-soft">{t(`net.kind.${b.kind}`)}</div>
        </div>
        <span className={`text-xs font-bold tabular ${net >= 0 ? 'text-ok' : 'text-bad'}`}>
          {net >= 0 ? '+' : ''}
          {money(net)}
          {t('net.per_day')}
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-[10px] text-ink-soft">
        <span>{t('net.occupancy')}</span>
        <StatBar value={(b.occupancy / cap) * 100} color="#b0882a" />
        <span className="tabular">
          {b.occupancy}/{cap}
        </span>
        <span>{t('net.quality')}</span>
        <StatBar value={b.quality} color="#2f9e9a" />
        <span className="tabular">
          {Math.round(b.quality)} → {target}
        </span>
      </div>
      {m ? (
        <div className="flex items-center gap-1.5 text-[11px]">
          <Avatar src={staffPortrait(m)} name={m.name} color={ROLES[m.role].cssColor} size={22} />
          <span className="flex-1 min-w-0 truncate">
            {t('net.managed_by', { name: name(m.name) })}
            {m.certs?.length ? ' 🎓' : ''}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-bad">{t('net.leaderless')}</span>
          <ManagerSelect kind={b.kind} value={pick} onChange={setPick} />
          <button
            type="button"
            onClick={() => {
              const id = pick || game.employees.find((e) => managerBlocker(game, b.kind, e.id) === null)?.id;
              if (id) dispatch({ type: 'assignBranchManager', branchId: b.id, managerId: id });
            }}
            className="px-2 py-0.5 rounded-lg bg-teal text-white text-[11px] font-semibold"
          >
            {t('net.assign')}
          </button>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={!ready || game.organization.cashSatang < SUPPORT_COST}
          onClick={() => dispatch({ type: 'supportBranch', branchId: b.id })}
          className="px-2 py-0.5 rounded-lg border border-teal text-teal text-[11px] font-semibold disabled:opacity-40"
          title={t('net.support_hint')}
        >
          🤝 {t('net.support', { cost: money(SUPPORT_COST) })}
        </button>
        {!ready && <span className="text-[10px] text-ink-soft">{t('net.support_wait', { n: b.supportReadyDay - dayOf(game.minute) })}</span>}
        <button
          type="button"
          onClick={() => (confirm ? dispatch({ type: 'closeBranch', branchId: b.id }) : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          className={`ml-auto px-2 py-0.5 rounded-lg text-[11px] ${confirm ? 'bg-bad text-white' : 'text-ink-soft hover:text-bad'}`}
        >
          {confirm ? t('net.close_sure') : t('net.close')}
        </button>
      </div>
    </div>
  );
}

/** Chapter 7: the multi-site dashboard. Network figures on top, each branch, and the branches you can still open. */
export function NetworkPanel() {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const bs = game.network.branches;
  const st = networkStats(game);
  const net = bs.reduce((a, b) => a + branchDailyNet(b), 0);
  const kinds = new Set(bs.map((b) => b.kind)).size;
  return (
    <>
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wide">🏢 {t('net.title')}</h3>
      <div className="grid grid-cols-2 gap-1.5 text-center">
        {[
          [t('net.branches'), `${bs.length}/${MAX_BRANCHES}`, t('net.kinds', { n: kinds })],
          [t('net.quality'), st.quality === null ? '—' : String(st.quality), t('net.avg')],
          [t('net.occupancy'), st.occupancy === null ? '—' : `${Math.round(st.occupancy * 100)}%`, `${st.used}/${st.capacity}`],
          [t('net.profit'), money(net), t('net.per_day_long')],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-xl bg-white border border-line px-2 py-1.5">
            <div className="text-[10px] text-ink-soft">{label}</div>
            <div className="text-base font-bold tabular leading-tight">{value}</div>
            <div className="text-[10px] text-ink-soft tabular">{sub}</div>
          </div>
        ))}
      </div>
      {bs.map((b) => (
        <BranchCard key={b.id} id={b.id} />
      ))}
      {bs.length < MAX_BRANCHES && (
        <>
          <div className="text-[11px] font-semibold text-ink-soft mt-1">{t('net.open_title')}</div>
          {BRANCH_ORDER.map((k) => (
            <OpenRow key={k} kind={k} />
          ))}
        </>
      )}
      <p className="text-[11px] text-ink-soft/80 leading-snug">{t('net.note')}</p>
    </>
  );
}
