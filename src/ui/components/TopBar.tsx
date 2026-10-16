import { useEffect, useState } from 'react';
import type { GameSpeed } from '../../domain/types';
import { dayOf, formatClock } from '../../sim/systems/time';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';

const SPEEDS: { speed: GameSpeed; label: string }[] = [
  { speed: 0, label: '❚❚' },
  { speed: 1, label: '1×' },
  { speed: 2, label: '2×' },
  { speed: 4, label: '4×' },
];

export function TopBar() {
  const t = useT();
  const money = useMoney();
  const minute = useGame((s) => s.game.minute);
  const speed = useGame((s) => s.game.speed);
  const cash = useGame((s) => s.game.organization.cashSatang);
  const reputation = useGame((s) => s.game.organization.reputation);
  const lang = useGame((s) => s.lang);
  const { dispatch, setLang, newGame } = useGame.getState();
  // Two-step confirm inside the page (browser confirm() dialogs are blocked in embedded viewers).
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const h = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(h);
  }, [confirming]);

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 bg-ink text-white">
      <div className="flex items-baseline gap-2 mr-auto">
        <span className="text-lg font-bold tracking-tight">{t('app.title')}</span>
        <span className="text-xs text-white/60">{t('app.subtitle')}</span>
      </div>

      <div className="flex items-center gap-3 tabular" aria-live="polite">
        <span className="text-sm text-white/70">{t('top.day', { day: dayOf(minute) })}</span>
        <span className="text-xl font-semibold">{formatClock(minute)}</span>
      </div>

      <div className="flex rounded-lg bg-white/10 p-0.5" role="group" aria-label="speed">
        {SPEEDS.map((s) => (
          <button
            key={s.speed}
            type="button"
            title={s.speed === 0 ? t('top.pause') : s.label}
            onClick={() => dispatch({ type: 'setSpeed', speed: s.speed })}
            className={`min-w-10 px-2.5 py-1 rounded-md text-sm font-semibold transition-colors ${
              speed === s.speed ? (s.speed === 0 ? 'bg-coral text-white' : 'bg-white text-ink') : 'text-white/80 hover:bg-white/15'
            }`}
            aria-pressed={speed === s.speed}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 tabular">
        <div className="leading-tight">
          <div className="text-[11px] text-white/60">{t('top.cash')}</div>
          <div className={`font-semibold ${cash < 0 ? 'text-red-300' : ''}`}>{money(cash)}</div>
        </div>
        <div className="leading-tight">
          <div className="text-[11px] text-white/60">{t('top.reputation')}</div>
          <div className="font-semibold">★ {reputation}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
          className="px-3 py-1 rounded-md border border-white/30 text-sm hover:bg-white/10"
        >
          {t('top.lang')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirming) {
              setConfirming(false);
              newGame();
            } else setConfirming(true);
          }}
          title={t('top.new_game_confirm')}
          className={`px-3 py-1 rounded-md border text-sm ${confirming ? 'bg-coral border-coral text-white' : 'border-white/30 hover:bg-white/10'}`}
        >
          {confirming ? t('top.new_game_sure') : t('top.new_game')}
        </button>
      </div>
    </header>
  );
}
