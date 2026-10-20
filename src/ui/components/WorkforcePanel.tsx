import { useState } from 'react';
import { staffPortrait } from '../portraits';
import { COURSES, COURSE_ORDER } from '../../data/workforce';
import { ROLES } from '../../data/staff';
import type { CourseId } from '../../domain/types';
import { contractsCompleted, placementBlocker, trainingBlocker, trainingSeats } from '../../sim/systems/workforce';
import { dayOf } from '../../sim/systems/time';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';
import { Avatar, RoleChip, StatBar, useName } from './people';

const ORG_ICON = { clinic: '🏥', hospital: '🏨', company: '🏭', school: '🏫' } as const;

function CourseRow({ course }: { course: CourseId }) {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const def = COURSES[course];
  const eligible = game.employees.filter((e) => {
    const b = trainingBlocker(game, e.id, course);
    return b === null || b === 'no_seat' || b === 'insufficient_funds';
  });
  const [pick, setPick] = useState('');
  const chosen = eligible.find((e) => e.id === pick) ?? eligible[0];
  const blocker = chosen ? trainingBlocker(game, chosen.id, course) : null;
  return (
    <div className="rounded-xl border border-line bg-white p-2 flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none" aria-hidden>
          🎓
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug">{t(`course.${course}`)}</div>
          <div className="text-[11px] text-ink-soft">
            {def.roles.map((r) => t(`role.${r}.short`)).join(', ')} · {money(def.costSatang)} · {t('wf.hours', { n: def.minutes / 60 })}
            {def.skill ? ` · +${t(`skill.${def.skill}`)}` : ''}
          </div>
        </div>
      </div>
      {eligible.length ? (
        <div className="flex items-center gap-1.5">
          <select value={chosen?.id ?? ''} onChange={(ev) => setPick(ev.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs" aria-label={t('wf.trainee')}>
            {eligible.map((e) => (
              <option key={e.id} value={e.id}>
                {name(e.name)} · {t(`role.${e.role}.short`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!chosen || blocker !== null}
            onClick={() => chosen && dispatch({ type: 'startTraining', employeeId: chosen.id, course })}
            className="px-2.5 py-1 rounded-lg bg-teal text-white text-xs font-semibold disabled:opacity-35"
            title={blocker ? t(`reason.${blocker}`) : undefined}
          >
            {t('wf.train')}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-ink-soft">{t('wf.no_trainee', { roles: def.roles.map((r) => t(`role.${r}.short`)).join(', ') })}</p>
      )}
      {blocker === 'no_seat' && <p className="text-[10px] text-warn">{t('reason.no_seat')}</p>}
    </div>
  );
}

function OfferCard({ offerId }: { offerId: string }) {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const o = game.workforce.offers.find((x) => x.id === offerId)!;
  const eligible = game.employees.filter((e) => placementBlocker(game, o.id, e.id) === null);
  // Staff with no shifts first: placing them leaves no hole in the roster.
  eligible.sort((a, b) => Number(game.shifts.some((s) => s.employeeId === a.id)) - Number(game.shifts.some((s) => s.employeeId === b.id)));
  const [pick, setPick] = useState('');
  const chosen = eligible.find((e) => e.id === pick) ?? eligible[0];
  const left = o.expiresDay - dayOf(game.minute);
  return (
    <div className="rounded-xl border border-line bg-white p-2 flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <span className="text-xl leading-none" aria-hidden>
          {ORG_ICON[o.orgKind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{name(o.org)}</div>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            <RoleChip role={o.role} label={t(`role.${o.role}.short`)} />
            {o.cert && <span className="text-[10px] px-1.5 rounded bg-ok/15 text-ok font-semibold">🎓 {t(`course.${o.cert}`)}</span>}
          </div>
          <div className="text-[11px] text-ink-soft mt-0.5 tabular">
            {t('wf.terms', { days: o.days, rate: money(o.ratePerDay), total: money(o.days * o.ratePerDay) })} · {t('wf.expires', { n: Math.max(0, left) })}
          </div>
        </div>
      </div>
      {eligible.length ? (
        <div className="flex items-center gap-1.5">
          <select value={chosen?.id ?? ''} onChange={(ev) => setPick(ev.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs" aria-label={t('wf.who')}>
            {eligible.map((e) => (
              <option key={e.id} value={e.id}>
                {name(e.name)}
                {game.shifts.some((s) => s.employeeId === e.id) ? ` · ${t('wf.leaves_roster')}` : ''}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => chosen && dispatch({ type: 'acceptOffer', offerId: o.id, employeeId: chosen.id })} className="px-2.5 py-1 rounded-lg bg-teal text-white text-xs font-semibold">
            {t('wf.place')}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-warn">{o.cert ? t('wf.no_one_cert', { role: t(`role.${o.role}.short`), cert: t(`course.${o.cert}`) }) : t('wf.no_one', { role: t(`role.${o.role}.short`) })}</p>
      )}
    </div>
  );
}

/** Chapter 5: the training centre and staff placements with partner organisations. */
export function WorkforcePanel() {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const wf = game.workforce;
  const seats = trainingSeats(game);
  const done = contractsCompleted(game, game.chapter.startDay);
  return (
    <section className="flex flex-col gap-2 mt-2">
      <div className="h-px bg-line" />
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wide">🎓 {t('wf.title')}</h3>
      <div className="text-xs rounded-lg px-2.5 py-1.5 bg-sand/70">{t('wf.status', { used: wf.training.length, seats, active: wf.contracts.length, done })}</div>
      {!seats && <p className="text-xs text-warn">{t('wf.no_room')}</p>}

      {wf.training.length > 0 && <div className="text-[11px] font-semibold text-ink-soft">{t('wf.in_class')}</div>}
      {wf.training.map((s) => {
        const e = game.employees.find((x) => x.id === s.employeeId);
        if (!e) return null;
        const total = COURSES[s.course].minutes;
        return (
          <div key={s.id} className="rounded-xl border border-line bg-white/70 p-2 flex items-center gap-2">
            <Avatar src={staffPortrait(e)} name={e.name} color={ROLES[e.role].cssColor} size={26} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">
                {name(e.name)} · {t(`course.${s.course}`)}
              </div>
              <StatBar value={((total - s.remaining) / total) * 100} color="#2f7d8c" />
              <div className="text-[10px] text-ink-soft">{t('wf.class_left', { n: Math.ceil(s.remaining / 60) })}</div>
            </div>
          </div>
        );
      })}

      <div className="text-[11px] font-semibold text-ink-soft">{t('wf.courses')}</div>
      {COURSE_ORDER.map((c) => (
        <CourseRow key={c} course={c} />
      ))}

      <div className="text-[11px] font-semibold text-ink-soft">{t('wf.offers')}</div>
      {!wf.offers.length && <p className="text-[11px] text-ink-soft">{seats ? t('wf.no_offers') : t('wf.offers_locked')}</p>}
      {wf.offers.map((o) => (
        <OfferCard key={o.id} offerId={o.id} />
      ))}

      {wf.contracts.length > 0 && <div className="text-[11px] font-semibold text-ink-soft">{t('wf.contracts')}</div>}
      {wf.contracts.map((c) => {
        const e = game.employees.find((x) => x.id === c.employeeId);
        return (
          <div key={c.id} className="rounded-xl border border-line bg-white/70 p-2 flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {ORG_ICON[c.orgKind]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">
                {name(c.org)} · {e ? name(e.name) : '—'}
              </div>
              <StatBar value={((c.done + c.missed) / c.days) * 100} color="#6a7d2a" />
              <div className="text-[10px] text-ink-soft tabular">
                {t('wf.progress', { done: c.done, days: c.days, rate: money(c.ratePerDay) })}
                {c.missed ? ` · ${t('wf.missed', { n: c.missed })}` : ''}
                {c.startDay > dayOf(game.minute) ? ` · ${t('wf.starts_tomorrow')}` : ''}
              </div>
            </div>
            <button type="button" onClick={() => dispatch({ type: 'endContract', contractId: c.id })} className="px-2 py-0.5 rounded-lg border border-line text-[11px] text-ink-soft">
              {t('wf.end')}
            </button>
          </div>
        );
      })}
      <p className="text-[11px] text-ink-soft/80 leading-snug">{t('wf.note')}</p>
    </section>
  );
}
