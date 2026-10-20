import { residentPortrait } from '../portraits';
import { CONSULT_FEE, IPD_FEE_PER_DAY, MAX_MISSED_ROUNDS } from '../../data/hospital';
import { clinicDesks, consultRate, freeStrokeBeds, hasDoctor, strokeBeds } from '../../sim/systems/hospital';
import { dayOf } from '../../sim/systems/time';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';
import { Avatar, useName } from './people';

/** Chapter 6: the neuro clinic's day, referrals waiting for a stroke-unit bed, and the inpatients. */
export function HospitalPanel() {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const h = game.hospital;
  const desks = clinicDesks(game);
  const beds = strokeBeds(game).length;
  const free = freeStrokeBeds(game).length;
  const rate = consultRate(game);
  const today = dayOf(game.minute);
  const booked = h.tasks.filter((x) => x.kind === 'consult').length;
  return (
    <section className="flex flex-col gap-2 mt-2">
      <div className="h-px bg-line" />
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wide">🧠 {t('hosp.title')}</h3>
      <div className="text-xs rounded-lg px-2.5 py-1.5 bg-sand/70 leading-relaxed">
        {t('hosp.opd', { desks, booked, done: h.today.consults, missed: h.today.missed, fee: money(CONSULT_FEE) })}
        {rate !== null && ` · ${t('hosp.rate', { pct: `${Math.round(rate * 100)}%` })}`}
        <br />
        {t('hosp.ipd', { n: h.inpatients.length, beds, fee: money(IPD_FEE_PER_DAY) })}
      </div>
      {!hasDoctor(game) && <p className="text-xs text-warn">{t('hosp.no_doctor')}</p>}
      {!desks && <p className="text-xs text-warn">{t('hosp.no_clinic')}</p>}
      {!beds && <p className="text-[11px] text-ink-soft">{t('hosp.no_unit')}</p>}

      <div className="text-[11px] font-semibold text-ink-soft">{t('hosp.referrals')}</div>
      {!h.referrals.length && <p className="text-[11px] text-ink-soft">{t('hosp.no_referrals')}</p>}
      {h.referrals.map((r) => (
        <div key={r.id} className="rounded-xl border border-line bg-white p-2 flex items-center gap-2">
          <Avatar src={residentPortrait(r.name)} name={r.name} color="#7a4fa0" size={30} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">
              {name(r.name, true)} <span className="text-xs font-normal text-ink-soft">{t('res.age', { age: r.age })}</span>
            </div>
            <div className="text-[11px] text-ink-soft truncate">{t('hosp.ref_terms', { days: r.stayDays, total: money(r.stayDays * IPD_FEE_PER_DAY), left: Math.max(0, r.expiresDay - today) })}</div>
          </div>
          <button type="button" disabled={!free} onClick={() => dispatch({ type: 'admitInpatient', referralId: r.id })} className="px-3 py-1 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-35">
            {t('hosp.admit')}
          </button>
        </div>
      ))}

      {h.inpatients.length > 0 && <div className="text-[11px] font-semibold text-ink-soft">{t('hosp.inpatients')}</div>}
      {h.inpatients.map((p) => {
        const day = Math.min(p.stayDays, today - p.admittedDay + 1);
        const risky = p.roundsMissed > MAX_MISSED_ROUNDS;
        return (
          <div key={p.id} className={`rounded-xl border p-2 flex items-center gap-2 ${risky ? 'border-warn/50 bg-warn/5' : 'border-line bg-white/70'}`}>
            <Avatar src={residentPortrait(p.name)} name={p.name} color="#7a4fa0" size={26} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{name(p.name, true)}</div>
              <div className={`text-[10px] truncate ${risky ? 'text-warn' : 'text-ink-soft'}`}>{t('hosp.stay', { day, n: p.stayDays, done: p.roundsDone, missed: p.roundsMissed })}</div>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-ink-soft/80 leading-snug">{t('hosp.note')}</p>
    </section>
  );
}
