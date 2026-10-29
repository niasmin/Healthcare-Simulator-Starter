import { useEffect } from 'react';
import { PATHS, PATH_GROUPS, hasPerk, needProgress, pathLevel, perkBlocker, type PathEffect, type PathNeed, type PerkDef } from '../../data/paths';
import { YEAR_DAYS, YEAR_STARS, empireActive, yearDaysLeft, yearTargets } from '../../sim/systems/empire';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';

type T = ReturnType<typeof useT>;

function effectText(t: T, e: PathEffect): string {
  if (e.kind === 'fee') return t('path.fx.fee', { what: t(`path.fee.${e.key}`), pct: e.percent });
  if (e.kind === 'enquiries') return t('path.fx.enquiries', { n: e.n });
  return t(`path.fx.${e.kind}`, { n: e.perDay });
}

function needText(t: T, n: PathNeed): string {
  if (n.kind === 'room') return t('path.need.room', { room: n.room, n: n.n });
  if (n.kind === 'clients') return t('path.need.clients', { n: n.n });
  if (n.kind === 'staff') return t('path.need.staff', { role: n.role, n: n.n });
  if (n.premium) return t('path.need.premium', { n: n.n });
  if (n.groups?.includes('dementia')) return t('path.need.dementia', { n: n.n });
  if (n.groups) return t('path.need.rehab', { n: n.n });
  return t('path.need.residents', { n: n.n });
}

/** The running empire year: days left, each target ticked off, and the years before. */
function EmpirePanel() {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const e = game.empire;
  if (!empireActive(game)) return <p className="rounded-xl border border-line bg-white p-2.5 text-xs text-ink-soft">👑 {t('empire.off')}</p>;
  if (!e) return <p className="rounded-xl border border-line bg-white p-2.5 text-xs text-ink-soft">👑 {t('empire.wait')}</p>;
  const targets = yearTargets(game, e.year, e.startDay);
  const fmt = (key: string, v: number) => (key === 'cash' || key === 'net' ? money(v) : v);
  return (
    <section className="rounded-xl border border-warn/50 bg-warn/10 p-2.5 flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <h3 className="font-bold flex-1">👑 {t('empire.title', { year: e.year })}</h3>
        <span className="text-xs tabular">{t('empire.left', { n: yearDaysLeft(game) })}</span>
      </div>
      <p className="text-[11px] text-ink-soft leading-snug">{t('empire.intro', { days: YEAR_DAYS })}</p>
      <ul className="text-sm flex flex-col gap-0.5">
        {targets.map((x) => (
          <li key={x.key} className={x.ok ? 'text-ok' : ''}>
            {x.ok ? '✅' : '⬜'} {t(`empire.t.${x.key}`, { have: fmt(x.key, x.have), need: fmt(x.key, x.need) })}
          </li>
        ))}
      </ul>
      <div className="text-xs font-semibold">⭐ {t('empire.reward', { n: YEAR_STARS + e.year })}</div>
      {e.past.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-soft">{t('empire.past')}</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {[...e.past].reverse().map((p) => (
              <li key={p.year}>{p.won ? t('empire.won', { year: p.year, stars: p.stars }) : t('empire.missed', { year: p.year })}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PerkRow({ perk }: { perk: PerkDef }) {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const owned = hasPerk(game, perk.id);
  const why = perkBlocker(game, perk.id);
  const [have, need] = needProgress(game, perk.needs);
  return (
    <li className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${owned ? 'bg-ok/10' : 'bg-paper'}`}>
      <span className="text-[10px] font-black text-ink-soft mt-0.5 w-4 shrink-0">{perk.tier}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">{t(`perk.${perk.id}`)}</div>
        <div className="text-xs text-teal leading-snug">{effectText(t, perk.effect)}</div>
        {!owned && (
          <div className={`text-[11px] leading-snug tabular ${have >= need ? 'text-ok' : 'text-ink-soft'}`}>
            {t('paths.need')}: {needText(t, perk.needs)} ({Math.min(have, need)}/{need}) · {money(perk.costSatang)}
          </div>
        )}
      </div>
      {owned ? (
        <span className="shrink-0 text-xs font-bold text-ok">✓ {t('paths.owned')}</span>
      ) : (
        <button
          type="button"
          disabled={!!why}
          title={why ? t(`reason.${why}`) : undefined}
          onClick={() => dispatch({ type: 'buyPerk', perk: perk.id })}
          className="shrink-0 px-3 py-1 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-35"
        >
          {why === 'needs_previous' ? '🔒' : t('paths.buy')}
        </button>
      )}
    </li>
  );
}

export function PathsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const game = useGame((s) => s.game);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('paths.title')} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">🧭 {t('paths.title')}</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <p className="text-xs text-ink-soft leading-relaxed">{t('paths.intro')}</p>
        <EmpirePanel />
        {PATH_GROUPS.map(({ group, paths }) => (
          <section key={group} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t(`paths.group.${group}`)}</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {paths.map((id) => {
                const p = PATHS[id];
                const lv = pathLevel(game, id);
                return (
                  <article key={id} className={`rounded-xl border p-2.5 flex flex-col gap-1.5 ${p.open ? 'border-line bg-white' : 'border-dashed border-line bg-white/50 opacity-70'}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-2xl leading-none" aria-hidden>
                        {p.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold leading-tight">{t(`path.${id}`)}</div>
                        <div className="text-[11px] text-ink-soft leading-snug">{t(`path.${id}.desc`)}</div>
                      </div>
                    </div>
                    {p.open ? (
                      <>
                        <div className="h-1.5 rounded-full bg-line overflow-hidden" title={t('paths.level', { n: lv })}>
                          <div className="h-full bg-teal" style={{ width: `${lv * 25}%` }} />
                        </div>
                        <ul className="flex flex-col gap-1">
                          {p.perks.map((perk) => (
                            <PerkRow key={perk.id} perk={perk} />
                          ))}
                        </ul>
                      </>
                    ) : (
                      <span className="self-start text-[11px] font-bold rounded-full bg-line px-2 py-0.5">{t('paths.soon')}</span>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
