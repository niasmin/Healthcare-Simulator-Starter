import { ROLE_PORTRAIT, residentPortrait } from '../portraits';
import { useMemo } from 'react';
import { CORRIDOR_COST_PER_TILE, REFUND_PERCENT, ROOMS, ROOM_TYPES } from '../../data/rooms';
import { DECOR, DECOR_ORDER, gardenAppeal, MAX_APPEAL } from '../../data/decor';
import { DECOR_SPRITE, spriteUrl } from '../../render/sprites';
import { ROLES, wageFor } from '../../data/staff';
import { freeBeds } from '../../domain/rules/beds';
import { monthlyFee, PROGRAMME_FEE } from '../../data/finance';
import { GROUP_WARD_EQUIPMENT } from '../../data/patients';
import type { RoomType } from '../../domain/types';
import { careKpis } from '../../sim/selectors';
import { useMoney, useT } from '../hooks';
import { useGame, type LeftTab, type Tool } from '../store';
import { Avatar, GROUP_COLOR, RoleChip, StatBar, useName } from './people';

/** Room pictures from the Game Assets Pack. */
const ROOM_ART: Record<RoomType, string> = {
  ward: 'rm_standard',
  nursing_station: 'rm_station',
  therapy: 'rm_therapy',
  staff_room: 'rm_dining',
};

const SWATCH: Record<RoomType, string> = {
  ward: '#4f8a80',
  nursing_station: '#4a6aa5',
  therapy: '#6b8f4e',
  staff_room: '#a77b4f',
};

function sameTool(a: Tool, b: Tool) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'room') return b.kind === 'room' && a.roomType === b.roomType;
  if (a.kind === 'decor') return b.kind === 'decor' && a.decor === b.decor;
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

  const item = (target: Tool, title: string, sub: string, swatch?: string, art?: string) => {
    const active = sameTool(tool, target);
    return (
      <button
        key={title}
        type="button"
        onClick={() => choose(target)}
        aria-pressed={active}
        className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
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
            <div className={`text-xs mt-0.5 ${active ? 'text-white/80' : 'text-ink-soft'}`}>{sub}</div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      {item({ kind: 'select' }, `🖐 ${t('tool.select')}`, t('tool.select.hint'))}
      {item({ kind: 'corridor' }, t('tool.corridor'), `${money(CORRIDOR_COST_PER_TILE)}${t('tool.per_tile')}`, '#d8cdb6')}
      {item({ kind: 'bulldoze' }, `⛏ ${t('tool.bulldoze')}`, t('tool.bulldoze.hint', { pct: REFUND_PERCENT }))}
      <div className="h-px bg-line my-1" />
      {ROOM_TYPES.map((rt) => {
        const d = ROOMS[rt];
        return item(
          { kind: 'room', roomType: rt },
          t(`room.${rt}`),
          `${t(`room.${rt}.desc`)} · ${money(d.baseCostSatang)} ${t('tool.base')} + ${money(d.costPerTileSatang)}${t('tool.per_tile')}`,
          SWATCH[rt],
          spriteUrl(ROOM_ART[rt]),
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
            <Avatar src={ROLE_PORTRAIT[a.role]} name={a.name} color={ROLES[a.role].cssColor} size={34} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{name(a.name, true)}</div>
              <div className="text-[11px] text-ink-soft">{t('hire.exp', { n: a.experienceYears })}</div>
            </div>
            <button
              type="button"
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
        </div>
      ))}
      <p className="text-[11px] text-ink-soft/80 leading-snug">{t('hire.note')}</p>
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
            <Avatar src={residentPortrait(c.name)} name={c.name} color={GROUP_COLOR[c.group]} size={34} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">
                {name(c.name, true)} <span className="font-normal text-ink-soft text-xs">{t('res.age', { age: c.age })}</span>
              </div>
              <div className="text-[11px] text-ink-soft truncate">
                {t(`group.${c.group}`)} · {t('res.level', { n: c.careLevel })} · {money(monthlyFee(c.careLevel, game.priceLevel, c.group))}
                {t('admit.per_month')}
              </div>
              {PROGRAMME_FEE[c.group] !== undefined && (
                <div className="text-[10px] font-semibold text-teal truncate">
                  ★ {t('admit.programme')}
                  {GROUP_WARD_EQUIPMENT[c.group] ? ` · ${t('admit.needs_secure')}` : ''}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={!freeBeds(game, c.group).length}
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
    </>
  );
}

export function LeftPanel() {
  const t = useT();
  const tab = useGame((s) => s.leftTab);
  const setTab = useGame((s) => s.setLeftTab);
  const tabs: { id: LeftTab; label: string }[] = [
    { id: 'build', label: t('tab.build') },
    { id: 'hire', label: t('tab.hire') },
    { id: 'admit', label: t('tab.admit') },
  ];
  return (
    <aside className="panel flex flex-col min-h-0 overflow-hidden">
      <div className="flex border-b border-line text-xs whitespace-nowrap" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`flex-1 px-2 py-2.5 text-center border-b-2 ${tab === x.id ? 'font-semibold border-teal text-teal' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 p-3 overflow-y-auto scroll-thin min-h-0">
        {tab === 'build' && <BuildTools />}
        {tab === 'hire' && <HireList />}
        {tab === 'admit' && <AdmitList />}
      </div>
    </aside>
  );
}
