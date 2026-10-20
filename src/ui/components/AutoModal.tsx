import { useEffect } from 'react';
import { AUTO_KEYS, autoSettings } from '../../sim/autopilot';
import { useT } from '../hooks';
import { useGame } from '../store';

const ICON: Record<(typeof AUTO_KEYS)[number], string> = { events: '✉️', admit: '🛏', carePlan: '📋', staff: '👥', build: '🏗' };

/** Autopilot switches: the home makes its own routine decisions, so the player can just watch. */
export function AutoModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const auto = autoSettings(useGame((s) => s.game));
  const dispatch = useGame((s) => s.dispatch);
  const allOn = AUTO_KEYS.every((k) => auto[k]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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
        <ul className="flex flex-col gap-2">
          {AUTO_KEYS.map((k) => (
            <li key={k}>
              <label className={`rounded-xl border p-2.5 flex items-start gap-2.5 cursor-pointer ${auto[k] ? 'border-teal/60 bg-teal/5' : 'border-line bg-white'}`}>
                <span className="text-2xl leading-none mt-0.5" aria-hidden>
                  {ICON[k]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{t(`auto.${k}`)}</span>
                  <span className="block text-xs text-ink-soft leading-snug">{t(`auto.${k}.desc`)}</span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 size-5 accent-teal shrink-0"
                  checked={auto[k]}
                  onChange={(e) => dispatch({ type: 'setAuto', settings: { [k]: e.target.checked } })}
                />
              </label>
            </li>
          ))}
        </ul>
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
