import { lowStock } from './InventoryModal';
import { useOpenMissions } from './GoalsModal';
import { MuteButton } from './Prefs';
import { useAutoOn } from './AutoModal';
import { useEffect, useState } from 'react';
import type { GameSpeed } from '../../domain/types';
import { dayOf, formatClock } from '../../sim/systems/time';
import { useMemo } from 'react';
import { headline } from '../../sim/selectors';
import { spriteUrl } from '../../render/sprites';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';

const SPEEDS: { speed: GameSpeed; label: string }[] = [
  { speed: 0, label: '❚❚' },
  { speed: 1, label: '1×' },
  { speed: 2, label: '2×' },
  { speed: 4, label: '4×' },
];

export function TopBar() {
  const openMissions = useOpenMissions();
  const lowItems = useGame((s) => lowStock(s.game));
  const settled = useGame((s) => s.game.residents.length > 0 || s.game.chapter.id > 1 || s.game.mode === 'sandbox');
  const stockNew = useGame((s) => !s.stockGuideSeen) && settled;
  const t = useT();
  const autoOn = useAutoOn();
  const money = useMoney();
  const minute = useGame((s) => s.game.minute);
  const speed = useGame((s) => s.game.speed);
  const cash = useGame((s) => s.game.organization.cashSatang);
  const reputation = useGame((s) => s.game.organization.reputation);
  const lang = useGame((s) => s.lang);
  const { dispatch, setLang, newGame } = useGame.getState();
  const game = useGame((s) => s.game);
  const h = useMemo(() => headline(game), [game]);
  const occPct = h.beds ? Math.round((h.residents / h.beds) * 100) : 0;
  // Two-step confirm inside the page (browser confirm() dialogs are blocked in embedded viewers).
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const h = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(h);
  }, [confirming]);

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 bg-ink text-white">
      <div className="flex items-baseline gap-2 mr-auto">
        <span className="text-lg font-bold tracking-tight">{t('app.title')}</span>
        <span className="text-xs text-white/60 max-2xl:hidden">{t('app.subtitle')}</span>
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
            data-tour={`speed-${s.speed}`}
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
        <img src={spriteUrl('ic_coin')} alt="" className="size-7 -mr-2" />
        <div className="leading-tight">
          <div className="text-[11px] text-white/60">{t('top.cash')}</div>
          <div className={`font-semibold ${cash < 0 ? 'text-red-300' : ''}`}>{money(cash)}</div>
          {h.cashDelta !== 0 && (
            <div className={`text-[10px] ${h.cashDelta > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {h.cashDelta > 0 ? '+' : ''}
              {money(h.cashDelta)}
            </div>
          )}
        </div>
        <img src={spriteUrl('ic_people')} alt="" className="size-7 -mr-2 hidden sm:block" />
        <div className="leading-tight hidden sm:block">
          <div className="text-[11px] text-white/60">{t('top.occupancy')}</div>
          <div className="font-semibold">
            {h.residents}/{h.beds}
          </div>
          <div className="h-1 w-16 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-emerald-400" style={{ width: `${occPct}%` }} />
          </div>
        </div>
        <img src={spriteUrl('ic_smile')} alt="" className="size-7 -mr-2 hidden sm:block" />
        <div className="leading-tight hidden sm:block">
          <div className="text-[11px] text-white/60">{t('top.satisfaction')}</div>
          <div className="font-semibold">{h.satisfaction === null ? '—' : `${Math.round(h.satisfaction)}%`}</div>
          <div className="h-1 w-16 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-amber-300" style={{ width: `${h.satisfaction ?? 0}%` }} />
          </div>
        </div>
        <div className="leading-tight">
          <div className="text-[11px] text-white/60">{t('top.reputation')}</div>
          <div className="font-semibold inline-flex items-center gap-1">
            <img src={spriteUrl('ic_star')} alt="" className="size-4" />
            {reputation}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => useGame.getState().setAutoOpen(true)}
          aria-pressed={autoOn}
          className={`px-3 py-1 rounded-md border text-sm font-semibold ${autoOn ? 'bg-[#f2b631] text-ink border-[#f2b631]' : 'bg-white/15 border-white/30 hover:bg-white/25'}`}
        >
          🤖 {t('hud.auto')}{autoOn ? ' ✓' : ''}
        </button>
        <button
          type="button"
          onClick={() => useGame.getState().setGoalsOpen(true)}
          className="relative px-3 py-1 rounded-md bg-white/15 border border-white/30 text-sm hover:bg-white/25 font-semibold"
        >
          🎯 {t('hud.daily')}
          {openMissions > 0 && settled && <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-coral text-white text-[10px] font-black grid place-items-center">{openMissions}</span>}
        </button>
        <button
          type="button"
          onClick={() => useGame.getState().setStockOpen(true)}
          className="relative px-3 py-1 rounded-md bg-white/15 border border-white/30 text-sm hover:bg-white/25 font-semibold"
        >
          📦 {t('stock.short')}
          {lowItems > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-coral text-white text-[10px] font-black grid place-items-center">{lowItems}</span>
          ) : (
            stockNew && <span className="absolute -top-1.5 -right-2 h-4 px-1 rounded-full bg-[#f2b631] text-ink text-[9px] font-black grid place-items-center">{t('stock.new')}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => useGame.getState().setCityOpen('city')}
          className="px-3 py-1 rounded-md bg-white/15 border border-white/30 text-sm hover:bg-white/25 font-semibold"
        >
          🏙️ {t('city.title')}
        </button>
        <button
          type="button"
          onClick={() => useGame.getState().setShopOpen(true)}
          className="px-3 py-1 rounded-md bg-white/15 border border-white/30 text-sm hover:bg-white/25 font-semibold"
        >
          🛒 {t('shop.title')}
        </button>
        <button
          type="button"
          onClick={() => useGame.getState().setCommunityOpen('support')}
          title={t('comm.title')}
          className="px-3 py-1 rounded-md bg-white/15 border border-white/30 text-sm hover:bg-white/25 font-semibold"
        >
          ☕
        </button>
        <button
          type="button"
          onClick={() => useGame.getState().setSaveOpen(true)}
          className="px-3 py-1 rounded-md bg-white/15 border border-white/30 text-sm hover:bg-white/25 font-semibold"
        >
          💾 {t('save.open')}
        </button>
        <MuteButton />
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
