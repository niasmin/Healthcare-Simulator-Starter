import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GameSpeed } from '../../domain/types';
import { headline, rosterView, summarize } from '../../sim/selectors';
import { TutorialCard } from './Tutorial';
import { dayOf, formatClock } from '../../sim/systems/time';
import { useMoney, useT } from '../hooks';
import { useGame, type View } from '../store';
import { LeftPanel } from './BuildPanel';
import { CenterArea } from './CenterArea';
import { Dashboard } from './Dashboard';
import { SidePanel } from './Inspector';
import { spriteUrl } from '../../render/sprites';

/**
 * Phone layout (< 1024px): the active view fills the screen, a bottom tab bar switches views,
 * and building / hiring / admitting / details open as bottom sheets.
 */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <>
      <div className="fixed inset-0 z-30 bg-ink/35" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-30 max-h-[80dvh] flex flex-col rounded-t-2xl bg-sand shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center gap-2 px-4 pt-2 pb-1 shrink-0">
          <span className="absolute left-1/2 -translate-x-1/2 top-1.5 h-1 w-10 rounded-full bg-ink/20" aria-hidden />
          <h2 className="font-semibold text-sm mt-2 flex-1">{title}</h2>
          <button type="button" onClick={onClose} className="mt-2 px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('m.close')}>
            ✕
          </button>
        </div>
        <div className="overflow-y-auto scroll-thin px-3 pb-3 min-h-0 flex flex-col gap-3 [&>*]:shrink-0 [&_aside]:overflow-visible [&_aside_*]:max-h-none">{children}</div>
      </section>
    </>
  );
}

const SPEEDS: { speed: GameSpeed; label: string }[] = [
  { speed: 0, label: '❚❚' },
  { speed: 1, label: '1×' },
  { speed: 2, label: '2×' },
  { speed: 4, label: '4×' },
];

function MobileTopBar({ alertCount }: { alertCount: number }) {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const setSheet = useGame((s) => s.setSheet);
  const h = useMemo(() => headline(game), [game]);
  return (
    <header className="bg-ink text-white px-3 pt-2 pb-1.5 flex flex-col gap-1.5 shrink-0">
      <div className="flex items-center gap-2">
        <div className="leading-none tabular">
          <div className="text-[10px] text-white/60">{t('top.day', { day: dayOf(game.minute) })}</div>
          <div className="text-lg font-semibold">{formatClock(game.minute)}</div>
        </div>
        <div className="flex rounded-lg bg-white/10 p-0.5 mx-auto" role="group" aria-label="speed">
          {SPEEDS.map((s) => (
            <button
              key={s.speed}
              type="button"
              onClick={() => dispatch({ type: 'setSpeed', speed: s.speed })}
              aria-pressed={game.speed === s.speed}
              className={`min-w-10 h-9 px-2 rounded-md text-sm font-semibold ${game.speed === s.speed ? (s.speed === 0 ? 'bg-coral text-white' : 'bg-white text-ink') : 'text-white/80'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setSheet('info')} className="relative size-9 grid place-items-center rounded-lg bg-white/10" aria-label={t('m.info')}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 20a2 2 0 004 0" />
          </svg>
          {alertCount > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-coral text-[11px] font-bold grid place-items-center">{alertCount}</span>}
        </button>
        <button type="button" onClick={() => setSheet('menu')} className="size-9 grid place-items-center rounded-lg bg-white/10 text-lg" aria-label={t('m.menu')}>
          ⋯
        </button>
      </div>
      <div className="flex items-center gap-3 text-[11px] tabular overflow-hidden">
        <img src={spriteUrl('ic_coin')} alt="" className="size-4 -mr-2" />
        <span className="font-semibold text-sm">{money(game.organization.cashSatang)}</span>
        {h.cashDelta !== 0 && <span className={h.cashDelta > 0 ? 'text-emerald-300' : 'text-red-300'}>{(h.cashDelta > 0 ? '+' : '') + money(h.cashDelta)}</span>}
        <span className="ml-auto text-white/85 inline-flex items-center gap-1">
          <img src={spriteUrl('ic_people')} alt={t('top.occupancy')} className="size-4" />
          {h.residents}/{h.beds}
        </span>
        <span className="text-white/85 inline-flex items-center gap-1">
          <img src={spriteUrl('ic_smile')} alt={t('top.satisfaction')} className="size-4" />
          {h.satisfaction === null ? '—' : Math.round(h.satisfaction)}
        </span>
        <span className="text-white/85 inline-flex items-center gap-1">
          <img src={spriteUrl('ic_star')} alt={t('top.reputation')} className="size-4" />
          {game.organization.reputation}
        </span>
      </div>
    </header>
  );
}

function MenuSheet() {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  const newGame = useGame((s) => s.newGame);
  const setSaveOpen = useGame((s) => s.setSaveOpen);
  const setSheet = useGame((s) => s.setSheet);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          setSheet(null);
          setSaveOpen(true);
        }}
        className="rounded-xl bg-teal text-white px-4 py-3 text-left font-semibold"
      >
        💾 {t('save.title')}
      </button>
      <button
        type="button"
        onClick={() => {
          setSheet(null);
          useGame.getState().setChaptersOpen(true);
        }}
        className="rounded-xl bg-white border border-line px-4 py-3 text-left"
      >
        🗺 {t('chapters.open')}
      </button>
      <button type="button" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} className="rounded-xl bg-white border border-line px-4 py-3 text-left">
        {t('m.language')}: <span className="font-semibold">{lang === 'th' ? 'ไทย → English' : 'English → ไทย'}</span>
      </button>
      <button
        type="button"
        onClick={() => (confirm ? newGame() : setConfirm(true))}
        className={`rounded-xl px-4 py-3 text-left border ${confirm ? 'bg-coral text-white border-coral' : 'bg-white border-line'}`}
      >
        {confirm ? t('top.new_game_sure') : t('top.new_game')}
      </button>
      <p className="text-[11px] text-ink-soft px-1">{t('disclaimer')}</p>
    </div>
  );
}

export function MobileShell() {
  const t = useT();
  const game = useGame((s) => s.game);
  const view = useGame((s) => s.view);
  const setView = useGame((s) => s.setView);
  const sheet = useGame((s) => s.sheet);
  const setSheet = useGame((s) => s.setSheet);
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const setLeftTab = useGame((s) => s.setLeftTab);

  const summary = useMemo(() => summarize(game), [game]);
  const alertCount = useMemo(() => {
    const roster = rosterView(game);
    return (
      game.site.rooms.filter((r) => !summary.statuses.get(r.id)?.operational).length +
      game.residents.filter((r) => !r.carePlan).length +
      (game.residents.length ? roster.slots.filter((x) => !x.ready).length : 0)
    );
  }, [game, summary]);

  // Lock page scrolling behind the full-screen app (iOS rubber-banding).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const tabs: { id: View | 'manage'; label: string; icon: string; count?: number }[] = [
    { id: 'map', label: t('view.map'), icon: 'M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z M9 4v13 M15 7v13' },
    { id: 'residents', label: t('view.residents'), icon: 'M12 11a4 4 0 100-8 4 4 0 000 8z M4 21a8 8 0 0116 0', count: game.residents.length },
    { id: 'roster', label: t('view.roster'), icon: 'M4 5h16v15H4z M4 10h16 M9 5v15 M15 5v15' },
    { id: 'finance', label: t('view.finance'), icon: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2' },
    { id: 'manage', label: t('m.manage'), icon: 'M4 6h16 M4 12h16 M4 18h16' },
  ];
  const placing = tool.kind !== 'select';
  const toolName =
    tool.kind === 'room' ? t(`room.${tool.roomType}`) : tool.kind === 'decor' ? t(`decor.${tool.decor}`) : tool.kind === 'corridor' ? t('tool.corridor') : t('tool.bulldoze');

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <MobileTopBar alertCount={alertCount} />

      <main className="relative flex-1 min-h-0">
        <CenterArea showTabs={false} />
        {view === 'map' && (
          <div className="absolute left-2 right-2 top-2 z-10 flex items-start gap-2 pointer-events-none">
            {placing ? (
              <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-teal text-white pl-3 pr-1 py-1 shadow-lg">
                <span className="text-sm font-semibold">{t('m.placing', { what: toolName })}</span>
                <button type="button" onClick={() => setTool({ kind: 'select' })} className="px-3 py-1.5 rounded-lg bg-white text-teal text-sm font-bold">
                  {t('m.done')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLeftTab('build');
                  setSheet('tools');
                }}
                className="pointer-events-auto rounded-xl bg-teal text-white px-4 py-2.5 text-sm font-bold shadow-lg"
              >
                🏗 {t('m.build')}
              </button>
            )}
            {!placing && <TutorialCard compact />}
          </div>
        )}
      </main>

      <nav className="shrink-0 grid grid-cols-5 bg-paper border-t border-line" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="views">
        {tabs.map((x) => {
          const active = x.id === 'manage' ? sheet === 'tools' : view === x.id && !sheet;
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                if (x.id === 'manage') setSheet(sheet === 'tools' ? null : 'tools');
                else {
                  setView(x.id);
                  setSheet(null);
                }
              }}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] ${active ? 'text-teal font-semibold' : 'text-ink-soft'}`}
            >
              <span className="relative">
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={x.icon} />
                </svg>
                {x.count ? <span className="absolute -top-1 -right-2.5 text-[9px] px-1 rounded-full bg-teal text-white tabular">{x.count}</span> : null}
              </span>
              <span className="truncate max-w-full px-0.5">{x.label}</span>
            </button>
          );
        })}
      </nav>

      {sheet === 'tools' && (
        <Sheet title={t('m.manage')} onClose={() => setSheet(null)}>
          <LeftPanel />
        </Sheet>
      )}
      {sheet === 'info' && (
        <Sheet title={t('m.info')} onClose={() => setSheet(null)}>
          <SidePanel />
          <Dashboard />
        </Sheet>
      )}
      {sheet === 'menu' && (
        <Sheet title={t('m.menu')} onClose={() => setSheet(null)}>
          <MenuSheet />
        </Sheet>
      )}
    </div>
  );
}
