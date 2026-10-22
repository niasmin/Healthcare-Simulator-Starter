import { useEffect, useMemo } from 'react';
import { DRILL_SATANG, FINE_PER_ITEM_SATANG, FOLLOW_UP_DAYS, INSPECTION_EVERY_DAYS, SAFETY_KIT_SATANG, STANDARDS } from '../../data/standards';
import { drillBlocker, safetyKitBlocker, standardsChecklist } from '../../sim/systems/standards';
import { dayOf } from '../../sim/systems/time';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';

/** Licensing standards: the checklist from the 2563 regulation, inspections, and what to fix. */
export function StandardsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const st = game.standards;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const checks = useMemo(() => standardsChecklist(game), [game]);
  const passed = checks.filter((c) => c.ok).length;
  const today = dayOf(game.minute);
  const kitBlocker = safetyKitBlocker(game);
  const drillBlock = drillBlocker(game);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('std.title')} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-testid="standards">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">🏛️ {t('std.title')}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular ${passed === checks.length ? 'bg-teal/15 text-teal' : 'bg-coral/10 text-coral'}`}>
            {t('std.score', { n: passed, total: checks.length })}
          </span>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <p className="text-sm leading-relaxed">{t('std.intro')}</p>
        {st?.on ? (
          <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${st.followUp ? 'bg-coral/10 text-coral' : 'bg-teal/10'}`}>
            {t(st.followUp ? 'std.next_follow' : 'std.next', { day: st.nextInspection, days: Math.max(0, st.nextInspection - today) })}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
            <p className="text-sm">{t('std.off', { days: INSPECTION_EVERY_DAYS, follow: FOLLOW_UP_DAYS, fine: money(FINE_PER_ITEM_SATANG) })}</p>
            <button type="button" onClick={() => dispatch({ type: 'setStandards', on: true })} className="rounded-xl bg-teal text-white font-bold px-3 py-2.5">
              {t('std.turn_on')}
            </button>
          </div>
        )}
        <ul className="flex flex-col gap-1.5">
          {checks.map((c) => {
            const def = STANDARDS.find((d) => d.id === c.id)!;
            return (
              <li key={c.id} className={`rounded-xl border bg-white px-3 py-2 ${c.ok ? 'border-line' : 'border-coral/40'}`} data-testid={`std-${c.id}`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none mt-0.5" aria-hidden>
                    {def.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-sm">{t(`std.${c.id}`)}</span>
                      <span className="text-[11px] text-ink-soft">{def.clause}</span>
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed">{t(`std.${c.id}.${c.ok ? 'ok' : 'fix'}`, c.params)}</p>
                    {c.id === 'safety_kit' && !c.ok && st?.on && (
                      <button type="button" disabled={!!kitBlocker} onClick={() => dispatch({ type: 'buySafetyKit' })} className="mt-1.5 rounded-lg bg-teal text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50">
                        {t('std.buy_kit', { cost: money(SAFETY_KIT_SATANG) })}
                      </button>
                    )}
                    {c.id === 'drill' && st?.on && (
                      <button type="button" disabled={!!drillBlock} onClick={() => dispatch({ type: 'runDrill' })} className="mt-1.5 rounded-lg bg-teal text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50">
                        {t('std.run_drill', { cost: money(DRILL_SATANG) })}
                      </button>
                    )}
                  </div>
                  <span className={`text-sm font-black ${c.ok ? 'text-teal' : 'text-coral'}`} aria-label={t(c.ok ? 'std.pass' : 'std.fail')}>
                    {c.ok ? '✓' : '✗'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {!!st?.history.length && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-bold">{t('std.history')}</h3>
            {[...st.history].reverse().map((h) => (
              <div key={`${h.day}-${h.followUp}`} className="flex flex-wrap gap-x-2 text-xs rounded-lg bg-white border border-line px-2.5 py-1.5">
                <span className="font-semibold">{t('std.visit_day', { day: h.day })}</span>
                <span>{h.followUp ? t('std.visit_follow') : t('std.visit_regular')}</span>
                <span className={h.failed.length ? 'text-coral' : 'text-teal'}>
                  {h.failed.length ? t('std.visit_failed', { n: h.failed.length, list: h.failed.map((id) => t(`std.${id}`)).join(', ') }) : t('std.visit_passed')}
                </span>
                {h.fineSatang > 0 && <span className="text-coral font-semibold">{t('std.visit_fine', { v: money(h.fineSatang) })}</span>}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-ink-soft leading-relaxed">{t('std.note')}</p>
        {st?.on && (
          <button type="button" onClick={() => dispatch({ type: 'setStandards', on: false })} className="self-start text-[11px] text-ink-soft underline">
            {t('std.turn_off')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Checks still failing while the mode is on (0 when it is off), for the button badge. */
export function useStandardsBadge(): number {
  return useGame((s) => (s.game.standards?.on ? standardsChecklist(s.game).filter((c) => !c.ok).length : 0));
}
