import { useEffect, useMemo } from 'react';
import { ACHIEVEMENTS, ALL_MISSIONS_BONUS, MISSIONS, TROPHY_STARS } from '../../data/goals';
import { DECOR, STAR_DECOR, starsLeft } from '../../data/decor';
import type { DecorType } from '../../domain/types';
import { goalsOf, missionsToday } from '../../sim/systems/goals';
import { useT } from '../hooks';
import { playSfx } from '../sound';
import { useGame } from '../store';

/** Daily missions (three a day) and achievements, rewarded with stars that count in the ranking. */
export function GoalsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const game = useGame((s) => s.game);
  const goals = goalsOf(game);
  const today = useMemo(() => missionsToday(game), [game]);
  const earned = ACHIEVEMENTS.filter((a) => goals.achievements[a.id] !== undefined).length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('goals.title')} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">🎯 {t('goals.title')}</h2>
          <span className="rounded-full bg-[#f2b631]/20 px-2.5 py-0.5 text-sm font-bold tabular" title={t('goals.stars_hint')}>
            ⭐ {goals.stars}
          </span>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <p className="text-xs text-ink-soft leading-relaxed">{t('goals.intro')}</p>

        <section className="flex flex-col gap-1.5" data-testid="missions-today">
          <div className="flex items-baseline gap-2">
            <h3 className="font-bold text-sm flex-1">{t('goals.today')}</h3>
            {goals.streak > 0 && <span className="text-[11px] font-semibold text-ok">🔥 {t('goals.streak', { n: goals.streak })}</span>}
          </div>
          {today.map((m) => (
            <div key={m.id} className={`rounded-xl border px-2.5 py-2 flex items-center gap-2 ${m.done ? 'border-ok/50 bg-ok/5' : 'border-line bg-white'}`}>
              <span className={`grid place-items-center size-5 rounded-full text-[11px] shrink-0 text-white ${m.done ? 'bg-ok' : 'bg-ink-soft/30'}`} aria-hidden>
                {m.done ? '✓' : ''}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{t(`mission.${m.id}`)}</div>
                {!m.done && MISSIONS[m.id].end && <div className="text-[11px] text-ink-soft">{m.met ? t('goals.on_track') : t('goals.end_of_day')}</div>}
              </div>
              <span className="text-xs font-bold tabular">+⭐{MISSIONS[m.id].reward}</span>
            </div>
          ))}
          <p className="text-[11px] text-ink-soft">{t('goals.bonus', { n: ALL_MISSIONS_BONUS })}</p>
        </section>

        <StarShop onPick={onClose} />

        <section className="flex flex-col gap-1" data-testid="trophies">
          <h3 className="font-bold text-sm">🏆 {t('goals.trophies')}</h3>
          <p className="text-[11px] text-ink-soft">{t('goals.trophies_hint', { a: TROPHY_STARS[0], b: TROPHY_STARS[1], c: TROPHY_STARS[2] })}</p>
          {goals.trophies?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {goals.trophies.map((tr) => (
                <span key={tr.month} className="rounded-full bg-[#fff6dd] border border-[#f2b631] px-2.5 py-0.5 text-xs font-semibold">
                  {['🥇', '🥈', '🥉'][tr.rank - 1]} {t('goals.trophy_month', { m: tr.month })}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-ink-soft">{t('goals.no_trophies')}</p>
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <h3 className="font-bold text-sm">
            {t('goals.achievements')} <span className="font-normal text-ink-soft tabular">{earned}/{ACHIEVEMENTS.length}</span>
          </h3>
          <ul className="grid grid-cols-2 gap-1.5" data-testid="achievements">
            {ACHIEVEMENTS.map((a) => {
              const day = goals.achievements[a.id];
              const got = day !== undefined;
              return (
                <li key={a.id} className={`rounded-xl border p-2 flex items-start gap-2 ${got ? 'border-[#f2b631] bg-[#fff6dd]' : 'border-line bg-white opacity-70'}`}>
                  <span className={`text-xl leading-none ${got ? '' : 'grayscale'}`} aria-hidden>
                    {a.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold leading-tight">{t(`ach.${a.id}`)}</div>
                    <div className="text-[10px] text-ink-soft leading-snug">{t(`ach.${a.id}.desc`)}</div>
                    <div className="text-[10px] font-semibold tabular mt-0.5">{got ? t('goals.earned_on', { day }) : `+⭐${a.reward}`}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** A toast (and a chime) for each mission or achievement as it is completed. */
export function useGoalToasts() {
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        const a = prev.game.goals;
        const b = s.game.goals;
        if (!a || !b || a === b || s.away || !s.started) return;
        const fresh = ACHIEVEMENTS.find((x) => b.achievements[x.id] !== undefined && a.achievements[x.id] === undefined);
        if (fresh) {
          s.notify('goals.toast_ach', 'ok', { achievement: fresh.id, n: fresh.reward });
          playSfx('win');
          return;
        }
        if (b.day === a.day && b.done.length > a.done.length) {
          const id = b.done[b.done.length - 1];
          s.notify('goals.toast_mission', 'ok', { mission: id, n: MISSIONS[id].reward });
          playSfx('chime');
        }
      }),
    [],
  );
}

/** How many of today's missions are still open (for a badge). */
export function useOpenMissions(): number {
  const game = useGame((s) => s.game);
  return useMemo(() => missionsToday(game).filter((m) => !m.done).length, [game]);
}

const STAR_ICON: Record<string, string> = { gold_lantern: '🏮', statue: '🗿', sakura_arch: '🌸', gold_fountain: '⛲' };

/** Exclusive garden pieces paid with stars; picking one starts placing it on the map. */
function StarShop({ onPick }: { onPick: () => void }) {
  const t = useT();
  const goals = useGame((s) => s.game.goals);
  const setTool = useGame((s) => s.setTool);
  const left = starsLeft(goals);
  const pick = (decor: DecorType) => {
    setTool({ kind: 'decor', decor });
    onPick();
  };
  return (
    <section className="flex flex-col gap-1.5" data-testid="star-shop">
      <div className="flex items-baseline gap-2">
        <h3 className="font-bold text-sm flex-1">⭐ {t('goals.shop')}</h3>
        <span className="text-[11px] text-ink-soft tabular">{t('goals.shop_left', { n: left })}</span>
      </div>
      <p className="text-[11px] text-ink-soft">{t('goals.shop_hint')}</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {STAR_DECOR.map((d) => {
          const cost = DECOR[d].stars ?? 0;
          return (
            <li key={d} className="rounded-xl border border-line bg-white p-2 flex items-center gap-2">
              <span className="text-2xl leading-none" aria-hidden>
                {STAR_ICON[d]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold leading-tight">{t(`decor.${d}`)}</div>
                <div className="text-[10px] text-ink-soft">{t('goals.shop_appeal', { n: DECOR[d].appeal })}</div>
              </div>
              <button type="button" disabled={left < cost} onClick={() => pick(d)} className="shrink-0 px-2 py-1 rounded-lg bg-[#f2b631] text-ink text-xs font-bold disabled:opacity-35">
                ⭐{cost}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
