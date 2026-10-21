import { rolePortrait, residentPortrait } from '../portraits';
import { useMemo } from 'react';
import { CORRIDOR_COST_PER_TILE, REFUND_PERCENT, ROOMS, ROOM_TYPES } from '../../data/rooms';
import { DECOR, DECOR_ORDER, gardenAppeal, MAX_APPEAL } from '../../data/decor';
import { DECOR_SPRITE, spriteUrl } from '../../render/sprites';
import { ROLES, wageFor } from '../../data/staff';
import { freeBeds } from '../../domain/rules/beds';
import { monthlyFee, PROGRAMME_FEE, VISIT_PRICE } from '../../data/finance';
import { nextPlot } from '../../data/chapters';
import { PREFABS, prefabCost } from '../../data/prefabs';
import { vansAvailable, visitRate } from '../../sim/systems/homecare';
import { SPECIALIST_GROUPS, GROUP_WARD_EQUIPMENT } from '../../data/patients';
import type { RoomType } from '../../domain/types';
import { careKpis } from '../../sim/selectors';
import { useMoney, useT } from '../hooks';
import { useGame, type LeftTab, type Tool } from '../store';
import { Avatar, GROUP_COLOR, RoleChip, StatBar, useName } from './people';
import { WorkforcePanel } from './WorkforcePanel';
import { HospitalPanel } from './HospitalPanel';
import { NetworkPanel } from './NetworkPanel';

/** Room pictures from the Game Assets Pack. */
const ROOM_ART: Record<RoomType, string> = {
  ward: 'rm_standard',
  nursing_station: 'rm_station',
  therapy: 'rm_therapy',
  staff_room: 'rm_dining',
  villa: 'rm_villa',
  homecare_office: 'rm_homecare',
  training_room: 'rm_training',
  neuro_clinic: 'rm_clinic',
  stroke_unit: 'rm_stroke',
  pharmacy: 'rm_pharmacy',
  dining_room: 'rm_dining_hall',
  laundry_room: 'rm_laundry',
  reception: 'rm_reception',
  storage_room: 'rm_storage',
  bathroom: 'rm_bath',
  accounting_office: 'rm_reception',
};

const SWATCH: Record<RoomType, string> = {
  ward: '#4f8a80',
  nursing_station: '#4a6aa5',
  therapy: '#6b8f4e',
  staff_room: '#a77b4f',
  villa: '#b08850',
  homecare_office: '#3f7f9a',
  training_room: '#2f7d8c',
  neuro_clinic: '#3b5ba5',
  stroke_unit: '#7a4fa0',
  pharmacy: '#2a7f7f',
  dining_room: '#c9771f',
  laundry_room: '#5f6b78',
  reception: '#4b4fc4',
  storage_room: '#8a6a45',
  bathroom: '#3f8fae',
  accounting_office: '#3c6e47',
};

function sameTool(a: Tool, b: Tool) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'room') return b.kind === 'room' && a.roomType === b.roomType;
  if (a.kind === 'decor') return b.kind === 'decor' && a.decor === b.decor;
  if (a.kind === 'prefab') return b.kind === 'prefab' && a.prefab === b.prefab;
  return true;
}

function BuildTools() {
  const t = useT();
  const money = useMoney();
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const setView = useGame((s) => s.setView);
  const setSheet = useGame((s) => s.setSheet);

  const decorCount = useGame((s) => s.game.site.decor.length);
  const appeal = useGame((s) => gardenAppeal(s.game.site.decor));
  const choose = (target: Tool) => {
    setTool(target);
    setView('map');
    setSheet(null); // phone: close the sheet so the map is free to drag on
  };

  const chapter = useGame((s) => s.game.chapter.id);
  const plot = nextPlot(useGame((s) => s.game.site.width));
  const site = useGame((s) => s.game.site);
  const dispatch = useGame((s) => s.dispatch);

  const item = (target: Tool, title: string, sub: string, swatch?: string, art?: string, tour?: string, lockedUntil?: number) => {
    const active = sameTool(tool, target);
    return (
      <button
        key={title}
        type="button"
        disabled={lockedUntil !== undefined}
        data-tour={tour}
        onClick={() => choose(target)}
        aria-pressed={active}
        className={`w-full text-left rounded-xl border px-3 py-2 transition-colors disabled:opacity-50 ${
          active ? 'border-teal bg-teal text-white shadow-sm' : 'border-line bg-white hover:border-teal/50'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {art && <img src={art} alt="" className="w-14 h-12 object-contain shrink-0 -my-0.5" draggable={false} />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {swatch && <span className="inline-block size-3 rounded-sm shrink-0" style={{ background: swatch }} />}
              <span className="font-semibold text-sm">{title}</span>
            </div>
            <div className={`text-xs mt-0.5 ${active ? 'text-white/80' : 'text-ink-soft'}`}>{lockedUntil !== undefined ? `🔒 ${t('build.locked', { c: lockedUntil })}` : sub}</div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      {item({ kind: 'select' }, `🖐 ${t('tool.select')}`, t('tool.select.hint'))}
      {item({ kind: 'corridor' }, t('tool.corridor'), `${money(CORRIDOR_COST_PER_TILE)}${t('tool.per_tile')}`, '#d8cdb6', undefined, 'tool-corridor')}
      {item({ kind: 'bulldoze' }, `⛏ ${t('tool.bulldoze')}`, t('tool.bulldoze.hint', { pct: REFUND_PERCENT }))}
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wide mt-1">⚡ {t('prefab.section')}</h3>
      <p className="text-[11px] text-ink-soft leading-snug -mt-1">{t('prefab.hint')}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {PREFABS.map((p) => {
          const def = ROOMS[p.roomType];
          const lockedAt = (def.unlockChapter ?? 1) > chapter ? def.unlockChapter : undefined;
          const active = tool.kind === 'prefab' && tool.prefab === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={lockedAt !== undefined}
              aria-pressed={active}
              onClick={() => choose({ kind: 'prefab', prefab: p.id, rotated: active ? !tool.rotated : false })}
              className={`rounded-xl border p-1.5 flex flex-col items-center text-center transition-colors disabled:opacity-45 ${
                active ? 'border-teal bg-teal text-white' : 'border-line bg-white hover:border-teal/50'
              }`}
            >
              <img src={spriteUrl(ROOM_ART[p.roomType])} alt="" className="h-10 w-full object-contain" draggable={false} />
              <span className="text-xs font-semibold leading-tight mt-0.5">{t(`prefab.${p.id}`)}</span>
              <span className={`text-[10px] tabular ${active ? 'text-white/80' : 'text-ink-soft'}`}>
                {lockedAt !== undefined ? `🔒 ${t('build.locked', { c: lockedAt })}` : `${active && tool.rotated ? `${p.h}×${p.w}` : `${p.w}×${p.h}`} · ${money(prefabCost(p))}`}
              </span>
            </button>
          );
        })}
      </div>
      {tool.kind === 'prefab' && (
        <button type="button" onClick={() => setTool({ ...tool, rotated: !tool.rotated })} className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold">
          ⟳ {t('prefab.rotate')}
        </button>
      )}
      <div className="h-px bg-line my-1" />
      {chapter >= 3 && (
        <button
          type="button"
          disabled={!plot || chapter < plot.chapter}
          onClick={() => dispatch({ type: 'expandLot' })}
          className="w-full text-left rounded-xl border border-teal/50 bg-teal/5 px-3 py-2 disabled:opacity-60"
        >
          <div className="font-semibold text-sm">🗺 {t(!plot ? 'build.land_done' : 'build.land', { w: site.width, h: site.height })}</div>
          {plot && (
            <div className="text-xs text-ink-soft mt-0.5">
              {chapter >= plot.chapter ? t('build.land_sub', { w: plot.width, h: site.height, cost: money(plot.priceSatang) }) : t('build.land_later', { w: plot.width, h: site.height, c: plot.chapter })}
            </div>
          )}
        </button>
      )}
      <div className="h-px bg-line my-1" />
      {ROOM_TYPES.map((rt) => {
        const d = ROOMS[rt];
        const locked = (d.unlockChapter ?? 1) > chapter ? d.unlockChapter : undefined;
        return item(
          { kind: 'room', roomType: rt },
          t(`room.${rt}`),
          `${t(`room.${rt}.desc`)} · ${money(d.baseCostSatang)} ${t('tool.base')} + ${money(d.costPerTileSatang)}${t('tool.per_tile')}`,
          SWATCH[rt],
          spriteUrl(ROOM_ART[rt]),
          `tool-room-${rt}`,
          locked,
        );
      })}
      <div className="h-px bg-line my-1" />
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wide">{t('decor.section')}</h3>
        <span className="text-[11px] text-ink-soft tabular" title={t('decor.appeal_hint')}>
          {t('decor.appeal', { n: Math.round(appeal * 10) / 10, max: MAX_APPEAL })}
        </span>
      </div>
      <p className="text-[11px] text-ink-soft leading-snug -mt-1">{t('decor.hint', { n: decorCount })}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {DECOR_ORDER.map((type) => {
          const target: Tool = { kind: 'decor', decor: type };
          const active = sameTool(tool, target);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => choose(target)}
              className={`rounded-xl border p-1.5 flex flex-col items-center text-center transition-colors ${
                active ? 'border-teal bg-teal text-white' : 'border-line bg-white hover:border-teal/50'
              }`}
            >
              <img src={spriteUrl(DECOR_SPRITE[type].name)} alt="" className="h-12 w-full object-contain" draggable={false} />
              <span className="text-xs font-semibold leading-tight mt-0.5">{t(`decor.${type}`)}</span>
              <span className={`text-[10px] tabular ${active ? 'text-white/80' : 'text-ink-soft'}`}>
                {money(DECOR[type].costSatang)} · ✿{DECOR[type].appeal}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function HireList() {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const kpi = useMemo(() => careKpis(game), [game]);
  return (
    <>
      <div className="text-xs text-ink-soft">{t('hire.staff_count', { n: game.employees.length, amount: money(kpi.payrollPerDaySatang) })}</div>
      {game.applicants.map((a) => (
        <div key={a.id} className="rounded-xl border border-line bg-white p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Avatar src={rolePortrait(a.role, 'smile')} name={a.name} color={ROLES[a.role].cssColor} size={34} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{name(a.name, true)}</div>
              <div className="text-[11px] text-ink-soft">{t('hire.exp', { n: a.experienceYears })}</div>
            </div>
            <button
              type="button"
              data-tour={`hire-${a.role}`}
              onClick={() => dispatch({ type: 'hireStaff', candidateId: a.id })}
              className="px-3 py-1 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-dark"
            >
              {t('hire.btn')}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <RoleChip role={a.role} label={t(`role.${a.role}`)} />
            <span className="text-xs tabular font-semibold">
              {money(wageFor(a.role, a.experienceYears))}
              <span className="font-normal text-ink-soft">{t('hire.per_month')}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {ROLES[a.role].skills.map((sk) => (
              <span key={sk} className="text-[10px] px-1.5 py-0.5 rounded bg-sand text-ink-soft">
                {t(`skill.${sk}`)}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-ink-soft leading-snug">{t(`role.${a.role}.jd`)}</p>
        </div>
      ))}
      <p className="text-[11px] text-ink-soft/80 leading-snug">{t('hire.note')}</p>
      {(game.chapter.id >= 5 || game.workforce.contracts.length > 0 || game.workforce.training.length > 0) && <WorkforcePanel />}
    </>
  );
}

function AdmitList() {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const setView = useGame((s) => s.setView);
  const free = useMemo(() => freeBeds(game).length, [game]);
  return (
    <>
      <div className={`text-xs rounded-lg px-2.5 py-1.5 ${free ? 'bg-ok/10 text-ok' : 'bg-warn/12 text-warn'}`}>
        {free ? t('admit.free_beds', { n: free }) : t('admit.no_beds')}
      </div>
      {game.waitlist.map((c) => (
        <div key={c.id} className="rounded-xl border border-line bg-white p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Avatar src={residentPortrait(c.name, c.needs)} name={c.name} color={GROUP_COLOR[c.group]} size={34} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">
                {name(c.name, true)} <span className="font-normal text-ink-soft text-xs">{t('res.age', { age: c.age })}</span>
              </div>
              <div className="text-[11px] text-ink-soft truncate">
                {t(`group.${c.group}`)} · {t('res.level', { n: c.careLevel })} · {money(monthlyFee(c.careLevel, game.priceLevel, c.group, c.premium))}
                {t('admit.per_month')}
              </div>
              {c.premium && <div className="text-[10px] font-semibold text-warn truncate">{t('admit.premium')}{freeBeds(game, c.group, true).length ? '' : ` · ${t('admit.no_villa')}`}</div>}
              {PROGRAMME_FEE[c.group] !== undefined && (
                <div className="text-[10px] font-semibold text-teal truncate">
                  ★ {t('admit.programme')}
                  {GROUP_WARD_EQUIPMENT[c.group] ? ` · ${t('admit.needs', { list: GROUP_WARD_EQUIPMENT[c.group]!.map((k) => t(`equip.${k}`)).join(' + ') })}` : ''}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={!freeBeds(game, c.group, !!c.premium).length}
              data-tour="admit"
              onClick={() => {
                const r = dispatch({ type: 'admitResident', candidateId: c.id });
                if (r.ok) setView('residents');
              }}
              className="px-3 py-1 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-dark disabled:opacity-35"
            >
              {t('admit.btn')}
            </button>
          </div>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[10px] text-ink-soft">
            <span>{t('need.physical')}</span>
            <StatBar value={c.needs.physical} color="#3aa76d" />
            <span>{t('need.mobility')}</span>
            <StatBar value={c.needs.mobility} color="#2f9e9a" />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-ink-soft/80 leading-snug">{t('admit.note')}</p>
      {(game.chapter.id >= 3 || game.mode === 'sandbox') && (
        <details className="rounded-xl border border-line bg-white p-2.5 text-[11px] leading-snug" data-testid="specialist-care">
          <summary className="font-semibold text-sm cursor-pointer">★ {t('spec.title')}</summary>
          <p className="text-ink-soft mt-1">{t('spec.hint')}</p>
          {SPECIALIST_GROUPS.map((g) => (
            <p key={g} className="mt-1.5">
              <span className="inline-block size-2 rounded-full mr-1 align-middle" style={{ background: GROUP_COLOR[g] }} />
              {t(`spec.${g}`)}
              <span className={`ml-1 font-semibold ${freeBeds(game, g).length ? 'text-ok' : 'text-ink-soft'}`}>{freeBeds(game, g).length ? `✓ ${t('admit.free_beds', { n: freeBeds(game, g).length })}` : ''}</span>
            </p>
          ))}
        </details>
      )}
      {(game.chapter.id >= 6 || game.hospital.inpatients.length > 0) && <HospitalPanel />}
      {(game.chapter.id >= 4 || game.homecare.clients.length > 0) && <HomeCareList />}
    </>
  );
}

/** Chapter 4: home-care enquiries and clients. */
function HomeCareList() {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const vans = vansAvailable(game);
  const rate = visitRate(game);
  const { clients, leads } = game.homecare;
  return (
    <section className="flex flex-col gap-2 mt-2">
      <div className="h-px bg-line" />
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wide">🚐 {t('hc.title')}</h3>
      <div className="text-xs rounded-lg px-2.5 py-1.5 bg-sand/70">
        {t('hc.clients', { n: clients.length, vans })}
        {rate !== null && ` · ${t('hc.rate', { pct: `${Math.round(rate * 100)}%` })}`}
      </div>
      {!vans && <p className="text-xs text-warn">{t('hc.no_office')}</p>}
      <div className="text-[11px] font-semibold text-ink-soft">{t('hc.leads')}</div>
      {!leads.length && <p className="text-[11px] text-ink-soft">{t('hc.none')}</p>}
      {leads.map((l) => (
        <div key={l.id} className="rounded-xl border border-line bg-white p-2 flex items-center gap-2">
          <Avatar src={residentPortrait(l.name)} name={l.name} color="#2f6aa5" size={30} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">
              {name(l.name, true)} <span className="text-xs font-normal text-ink-soft">{t('res.age', { age: l.age })}</span>
            </div>
            <div className="text-[11px] text-ink-soft truncate">{t(`hc.plan.${l.plan}`, { price: money(VISIT_PRICE[l.plan]) })}</div>
          </div>
          <button type="button" disabled={!vans} onClick={() => dispatch({ type: 'admitClient', leadId: l.id })} className="px-3 py-1 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-35">
            {t('hc.accept')}
          </button>
        </div>
      ))}
      {clients.map((c) => (
        <div key={c.id} className="rounded-xl border border-line bg-white/70 p-2 flex items-center gap-2">
          <Avatar src={residentPortrait(c.name)} name={c.name} color="#2f6aa5" size={26} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{name(c.name, true)}</div>
            <div className="text-[10px] text-ink-soft truncate">
              {t(`hc.plan.${c.plan}`, { price: money(VISIT_PRICE[c.plan]) })} · {t('hc.sat', { n: Math.round(c.satisfaction) })}
            </div>
          </div>
          <button type="button" onClick={() => dispatch({ type: 'dischargeClient', clientId: c.id })} className="px-2 py-0.5 rounded-lg border border-line text-[11px] text-ink-soft">
            {t('hc.end')}
          </button>
        </div>
      ))}
    </section>
  );
}

export function LeftPanel() {
  const t = useT();
  const tab = useGame((s) => s.leftTab);
  const setTab = useGame((s) => s.setLeftTab);
  const network = useGame((s) => s.game.chapter.id >= 7 || s.game.network.branches.length > 0);
  const tabs: { id: LeftTab; label: string }[] = [
    { id: 'build', label: t('tab.build') },
    { id: 'hire', label: t('tab.hire') },
    { id: 'admit', label: t('tab.admit') },
    ...(network ? [{ id: 'network' as const, label: t('tab.network') }] : []),
  ];
  return (
    <aside className="panel flex flex-col min-h-0 overflow-hidden">
      <div className={`flex border-b border-line whitespace-nowrap ${tabs.length > 3 ? "text-[11px] gap-1 px-1" : "text-xs"}`} role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            data-tour={`tab-${x.id}`}
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`flex-1 min-w-0 px-1 py-2.5 text-center border-b-2 ${tab === x.id ? 'font-semibold border-teal text-teal' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 p-3 overflow-y-auto scroll-thin min-h-0">
        {tab === 'build' && <BuildTools />}
        {tab === 'hire' && <HireList />}
        {tab === 'admit' && <AdmitList />}
        {tab === 'network' && <NetworkPanel />}
      </div>
    </aside>
  );
}
