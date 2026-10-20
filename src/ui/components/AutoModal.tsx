import { useEffect } from 'react';
import { AUTO_GROUPS, AUTO_KEYS, autoSettings, type AutoKey } from '../../sim/autopilot';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';

const ICON: Record<AutoKey, string> = {
  events: '✉️',
  admit: '🛏',
  carePlan: '📋',
  staff: '👥',
  build: '🏗',
  estate: '🌳',
  homecare: '🚐',
  training: '🎓',
  placements: '🏭',
  branches: '🏢',
  shop: '🛒',
  chapters: '🏆',
};

/** Autopilot switches: the home makes its own routine decisions, so the player can just watch. */
export function AutoModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const auto = autoSettings(useGame((s) => s.game));
  const dispatch = useGame((s) => s.dispatch);
  const awayPlay = useGame((s) => s.awayPlay);
  const setAwayPlay = useGame((s) => s.setAwayPlay);
  const allOn = AUTO_KEYS.every((k) => auto[k]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const row = (id: string, icon: string, title: string, desc: string, checked: boolean, onChange: (v: boolean) => void) => (
    <li key={id}>
      <label className={`rounded-xl border p-2.5 flex items-start gap-2.5 cursor-pointer ${checked ? 'border-teal/60 bg-teal/5' : 'border-line bg-white'}`}>
        <span className="text-2xl leading-none mt-0.5" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{title}</span>
          <span className="block text-xs text-ink-soft leading-snug">{desc}</span>
        </span>
        <input type="checkbox" className="mt-1 size-5 accent-teal shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
    </li>
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('auto.title')} onClick={onClose}>
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">🤖 {t('auto.title')}</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <p className="text-xs text-ink-soft leading-relaxed">{t('auto.intro')}</p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'setAuto', settings: Object.fromEntries(AUTO_KEYS.map((k) => [k, !allOn])) })}
          className={`w-full rounded-xl px-3 py-2 text-sm font-bold ${allOn ? 'bg-white border border-line' : 'bg-teal text-white'}`}
        >
          {t(allOn ? 'auto.all_off' : 'auto.all_on')}
        </button>
        {AUTO_GROUPS.map((g) => (
          <section key={g.id} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t(`auto.group.${g.id}`)}</h3>
            <ul className="flex flex-col gap-2">{g.keys.map((k) => row(k, ICON[k], t(`auto.${k}`), t(`auto.${k}.desc`), auto[k], (v) => dispatch({ type: 'setAuto', settings: { [k]: v } })))}</ul>
          </section>
        ))}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t('auto.group.away')}</h3>
          <ul className="flex flex-col gap-2">{row('away', '🌙', t('auto.away'), t('auto.away.desc'), awayPlay, setAwayPlay)}</ul>
        </section>
        <p className="text-[11px] text-ink-soft leading-relaxed">{t('auto.note')}</p>
      </div>
    </div>
  );
}

/** True when any autopilot switch is on (for the "AUTO" badge on buttons). */
export function useAutoOn(): boolean {
  const auto = useGame((s) => s.game.auto);
  return !!auto && AUTO_KEYS.some((k) => auto[k]);
}

/** While catching up the time away: a small progress banner. */
export function AwayProgress() {
  const t = useT();
  const away = useGame((s) => s.away);
  if (!away) return null;
  const pct = Math.round((away.done / away.total) * 100);
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-16 z-50 rounded-xl bg-ink text-white px-4 py-2 shadow-xl text-sm flex items-center gap-3" role="status">
      <span>🌙 {t('away.running')}</span>
      <span className="w-24 h-1.5 rounded-full bg-white/20 overflow-hidden">
        <span className="block h-full bg-[#f2b631]" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular">{pct}%</span>
    </div>
  );
}

/** "While you were away": what the autopilot did. */
export function AwayReportModal() {
  const t = useT();
  const money = useMoney();
  const r = useGame((s) => s.awayReport);
  const close = () => useGame.getState().setAwayReport(null);
  if (!r) return null;
  const days = Math.round((r.ticks / 144) * 10) / 10;
  const sign = (n: number) => (n > 0 ? '+' : '');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('away.title')} onClick={close}>
      <div className="w-full max-w-sm rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-lg">🌙 {t('away.title')}</h2>
        <p className="text-sm text-ink-soft">{t('away.summary', { days, from: r.fromDay, to: r.toDay })}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-white border border-line p-2">
            <dt className="text-xs text-ink-soft">{t('away.cash')}</dt>
            <dd className={`font-bold tabular ${r.cashDelta >= 0 ? 'text-ok' : 'text-bad'}`}>
              {sign(r.cashDelta)}
              {money(r.cashDelta)}
            </dd>
          </div>
          <div className="rounded-xl bg-white border border-line p-2">
            <dt className="text-xs text-ink-soft">{t('away.residents')}</dt>
            <dd className="font-bold tabular">
              {sign(r.residentsDelta)}
              {r.residentsDelta}
            </dd>
          </div>
          <div className="rounded-xl bg-white border border-line p-2 col-span-2">
            <dt className="text-xs text-ink-soft">{t('away.chapter')}</dt>
            <dd className="font-bold">{r.chaptersWon > 0 ? t('away.won', { n: r.chaptersWon, c: r.chapter }) : t('away.same', { c: r.chapter })}</dd>
          </div>
        </dl>
        {r.stoppedEarly && <p className="text-xs text-warn">{t('away.stopped')}</p>}
        <button type="button" onClick={close} className="w-full rounded-xl bg-teal text-white px-3 py-2 text-sm font-bold">
          {t('away.ok')}
        </button>
      </div>
    </div>
  );
}
