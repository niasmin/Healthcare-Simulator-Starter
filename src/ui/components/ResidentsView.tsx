import { residentPortrait } from '../portraits';
import { useState } from 'react';
import { parseBedId } from '../../domain/rules/beds';
import type { CareTask, NeedKey, Resident } from '../../domain/types';
import { formatClock } from '../../sim/systems/time';
import { useT } from '../hooks';
import { useGame } from '../store';
import { Avatar, GROUP_COLOR, StatBar, useName } from './people';

/** Stat rows in the order of the GDD's sample Resident Profile. */
const NEEDS: { key: NeedKey; color: string; glyph: string }[] = [
  { key: 'physical', color: '#3aa76d', glyph: '♥' },
  { key: 'mobility', color: '#2f9e9a', glyph: '⇢' },
  { key: 'mental', color: '#4a6aa5', glyph: '◐' },
  { key: 'happiness', color: '#8a5a9e', glyph: '☺' },
  { key: 'satisfaction', color: '#2b9a66', glyph: '★' },
  { key: 'nutrition', color: '#c9822b', glyph: '◍' },
];

const STATUS_STYLE: Record<CareTask['status'], string> = {
  done: 'bg-ok',
  missed: 'bg-bad',
  in_progress: 'bg-teal animate-pulse',
  pending: 'bg-line',
};

function ResidentCard({ r }: { r: Resident }) {
  const t = useT();
  const name = useName();
  const dispatch = useGame((s) => s.dispatch);
  const minute = useGame((s) => s.game.minute);
  const tasks = useGame((s) => s.game.tasks);
  const hasRn = useGame((s) => s.game.employees.some((e) => e.skills.includes('assessment')));
  const [confirm, setConfirm] = useState(false);

  const dayStart = Math.floor(minute / 1440) * 1440;
  const today = tasks.filter((x) => x.residentId === r.id && x.dueAt >= dayStart && x.dueAt < dayStart + 1440).sort((a, b) => a.dueAt - b.dueAt);
  const count = (st: CareTask['status']) => today.filter((x) => x.status === st).length;

  return (
    <article className="rounded-2xl bg-white border border-line shadow-[0_1px_0_rgba(31,45,43,0.04)] p-4 flex flex-col gap-3 min-w-0">
      <header className="flex items-start gap-3">
        <Avatar src={residentPortrait(r.name, r.needs)} name={r.name} color={GROUP_COLOR[r.group]} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-ink-soft">{t('res.profile')}</div>
          <h3 className="font-bold text-base leading-tight">
            {name(r.name, true)} <span className="font-medium text-ink-soft text-sm">{t('res.age', { age: r.age })}</span>
          </h3>
          <div className="text-xs text-ink-soft mt-0.5">{t(`group.${r.group}`)}</div>
        </div>
      </header>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: GROUP_COLOR[r.group] }}>
          {t('res.level', { n: r.careLevel })}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-sand text-ink-soft">
          {t('room.ward')} · {t('res.bed', { n: parseBedId(r.bedId).index + 1 })}
        </span>
      </div>

      <dl className="grid grid-cols-[1.25rem_minmax(0,7.5rem)_1fr_2rem] items-center gap-x-2 gap-y-1.5 text-xs">
        {NEEDS.map((n) => (
          <div key={n.key} className="contents">
            <dt className="grid place-items-center size-5 rounded-md text-white text-[11px]" style={{ background: n.color }} aria-hidden>
              {n.glyph}
            </dt>
            <dd className="truncate">{t(`need.${n.key}`)}</dd>
            <dd>
              <StatBar value={r.needs[n.key]} color={n.color} />
            </dd>
            <dd className="tabular text-right font-semibold">{Math.round(r.needs[n.key])}</dd>
          </div>
        ))}
      </dl>

      {r.carePlan ? (
        <div className="rounded-xl bg-paper border border-line p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ok">✓ {t('res.plan_active')}</span>
            <span className="text-ink-soft">{t('res.today')}</span>
          </div>
          <div className="flex flex-wrap gap-1" aria-label={t('res.today')}>
            {today.map((x) => (
              <span
                key={x.id}
                title={`${formatClock(x.dueAt)} ${t(`task.${x.kind}`)}`}
                className={`h-2.5 w-4 rounded-sm ${STATUS_STYLE[x.status]}`}
              />
            ))}
          </div>
          <div className="text-[11px] text-ink-soft tabular">
            {t('res.counts', { done: count('done'), missed: count('missed'), pending: count('pending') + count('in_progress') })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-warn leading-snug">{t('res.no_plan')}</p>
          <button
            type="button"
            disabled={!hasRn}
            onClick={() => dispatch({ type: 'createCarePlan', residentId: r.id })}
            className="w-full rounded-xl bg-teal text-white font-semibold py-2 hover:bg-teal-dark disabled:opacity-40"
          >
            {t('res.create_plan')}
          </button>
          {!hasRn && <p className="text-[11px] text-ink-soft leading-snug">{t('res.need_rn')}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (confirm) dispatch({ type: 'dischargeResident', residentId: r.id });
          setConfirm(!confirm);
        }}
        onBlur={() => setConfirm(false)}
        className={`self-end text-[11px] px-2 py-0.5 rounded-md ${confirm ? 'bg-bad text-white' : 'text-ink-soft hover:text-bad'}`}
      >
        {confirm ? t('res.discharge_sure') : t('res.discharge')}
      </button>
    </article>
  );
}

export function ResidentsView() {
  const t = useT();
  const residents = useGame((s) => s.game.residents);
  if (!residents.length) return <div className="grid place-items-center h-full p-8 text-center text-ink-soft text-sm">{t('res.empty')}</div>;
  return (
    <div className="grid gap-3 p-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))] content-start">
      {residents.map((r) => (
        <ResidentCard key={r.id} r={r} />
      ))}
    </div>
  );
}
