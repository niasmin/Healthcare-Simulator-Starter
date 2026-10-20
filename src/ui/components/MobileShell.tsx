import { AccountRow, PrefsList } from './Prefs';
import { useAutoOn } from './AutoModal';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GameSpeed } from '../../domain/types';
import { headline, rosterView, summarize } from '../../sim/selectors';
import { MissionCard, ObjectiveList } from './Tutorial';
import { chapterDef } from '../../data/chapters';
import { nextChapterAvailable } from '../../sim/systems/chapter';
import ownerFace from '../../assets/faces/owner_f_smile.png';
import clipIcon from '../../assets/hud/clip.png';
import eventsIcon from '../../assets/hud/events.png';
import trophyIcon from '../../assets/hud/trophy.png';
import shopIcon from '../../assets/hud/shop.png';
import mapIcon from '../../assets/hud/map.png';
import hatIcon from '../../assets/hud/hat.png';
import peopleIcon from '../../assets/hud/people.png';
import chartIcon from '../../assets/hud/chart.png';
import staffIcon from '../../assets/title/ic_staff.png';
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

function HudPill({ children, onClick, label }: { children: ReactNode; onClick?: () => void; label?: string }) {
  const cls = 'pointer-events-auto flex items-center gap-1.5 rounded-full bg-[#14365f]/85 border border-white/25 text-white pl-1 pr-2 h-8 text-[13px] font-bold tabular shadow';
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} aria-label={label}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

function RoundButton({ onClick, label, children, dot, tour }: { onClick: () => void; label: string; children: ReactNode; dot?: number; tour?: string }) {
  return (
    <button type="button" data-tour={tour} onClick={onClick} className="pointer-events-auto relative size-9 shrink-0 grid place-items-center rounded-xl bg-[#14365f]/85 border border-white/25 text-white shadow" aria-label={label}>
      {children}
      {dot ? <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-coral text-[10px] font-bold grid place-items-center">{dot}</span> : null}
    </button>
  );
}

/** Phone HUD over the map, in the play-screen concept style: manager card, money, clock and speed, stats. */
function MobileTopBar({ alertCount, overlay }: { alertCount: number; overlay: boolean }) {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const setSheet = useGame((s) => s.setSheet);
  const setView = useGame((s) => s.setView);
  const h = useMemo(() => headline(game), [game]);
  const days = chapterDef(game.chapter.id).days;
  const chapterDay = Math.max(1, Math.min(days, dayOf(game.minute) - game.chapter.startDay + 1));
  return (
    <header
      className={`px-2 pt-[max(env(safe-area-inset-top),0.4rem)] pb-1 flex flex-col gap-1 ${
        overlay ? 'absolute inset-x-0 top-0 z-20 pointer-events-none bg-gradient-to-b from-[#0d2440]/70 via-[#0d2440]/35 to-transparent' : 'shrink-0 bg-[#0d2440]'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => useGame.getState().setChaptersOpen(true)}
          className="pointer-events-auto flex items-center min-w-0 shrink rounded-full bg-[#14365f]/85 border border-white/25 shadow pr-2.5"
          aria-label={t('chapters.open')}
        >
          <img src={ownerFace} alt="" className="size-10 -my-1 -ml-0.5 rounded-full border-2 border-white bg-[#cfe6f5] object-cover shrink-0" />
          <span className="pl-1.5 min-w-0 text-left leading-tight">
            <span className="block text-white text-[11px] font-bold whitespace-nowrap">{t('hud.title')}</span>
            <span className="block text-white/80 text-[10px] tabular truncate">{game.mode === 'sandbox' ? `${t('home.mode_sandbox')} · ${t('top.day', { day: dayOf(game.minute) })}` : t('hud.chapter_day', { c: game.chapter.id, d: chapterDay, n: days })}</span>
            <span className="mt-0.5 block h-1.5 w-20 rounded-full bg-white/20 overflow-hidden" aria-hidden>
              <span className="block h-full bg-[#2bc183]" style={{ width: `${(chapterDay / days) * 100}%` }} />
            </span>
          </span>
        </button>
        <HudPill
          label={t('hud.add_cash')}
          onClick={() => {
            setView('finance');
            setSheet(null);
          }}
        >
          <img src={spriteUrl('ic_coin')} alt="" className="size-6" />
          <span className={game.organization.cashSatang < 0 ? 'text-red-300' : ''}>{money(game.organization.cashSatang).replace('฿', '')}</span>
          <span className="size-5 rounded-full bg-[#22b45f] text-white grid place-items-center text-sm leading-none" aria-hidden>
            +
          </span>
        </HudPill>
        <span className="flex-1" />
        <RoundButton onClick={() => setSheet('info')} label={t('m.info')} dot={alertCount} tour="m-info">
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M12 2a6 6 0 00-6 6v4.5L4 16v1h16v-1l-2-3.5V8a6 6 0 00-6-6zm-2.5 17a2.5 2.5 0 005 0h-5z" />
          </svg>
        </RoundButton>
        <RoundButton onClick={() => setSheet('menu')} label={t('m.menu')}>
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.4-2.5 1a7.6 7.6 0 00-1.7-1L15 3.3h-4l-.4 2.7a7.6 7.6 0 00-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 000 2l-2.2 1.6 2 3.4 2.5-1a7.6 7.6 0 001.7 1l.4 2.7h4l.4-2.7a7.6 7.6 0 001.7-1l2.5 1 2-3.4L19.4 13zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
          </svg>
        </RoundButton>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="pointer-events-auto flex items-center rounded-full bg-[#14365f]/85 border border-white/25 shadow h-8 pl-2.5 pr-0.5 gap-1.5 text-white">
          <span className="text-[13px] font-bold tabular" title={t('top.day', { day: dayOf(game.minute) })}>
            {formatClock(game.minute)}
          </span>
          <span className="flex" role="group" aria-label="speed">
            {SPEEDS.map((x) => (
              <button
                key={x.speed}
                type="button"
                data-tour={`speed-${x.speed}`}
                onClick={() => dispatch({ type: 'setSpeed', speed: x.speed })}
                aria-pressed={game.speed === x.speed}
                className={`h-7 min-w-7 px-1 rounded-full text-[12px] font-bold ${game.speed === x.speed ? (x.speed === 0 ? 'bg-coral text-white' : 'bg-white text-[#14365f]') : 'text-white/80'}`}
              >
                {x.label}
              </button>
            ))}
          </span>
        </div>
        <span className="flex-1" />
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-[#14365f]/85 border border-white/25 shadow h-8 px-2 text-white text-[12px] font-bold tabular shrink-0">
          <span className="inline-flex items-center gap-1" title={t('top.occupancy')}>
            <img src={spriteUrl('ic_people')} alt={t('top.occupancy')} className="size-4" />
            {h.residents}/{h.beds}
          </span>
          <span className="inline-flex items-center gap-1" title={t('top.satisfaction')}>
            <img src={spriteUrl('ic_smile')} alt={t('top.satisfaction')} className="size-4" />
            {h.satisfaction === null ? '—' : Math.round(h.satisfaction)}
          </span>
          <span className="inline-flex items-center gap-1" title={t('top.reputation')}>
            <img src={spriteUrl('ic_star')} alt={t('top.reputation')} className="size-4" />
            {game.organization.reputation}
          </span>
        </div>
      </div>
    </header>
  );
}

/** Square floating map button with a concept-art icon and a caption. */
function FloatButton({ icon, emoji, label, onClick, badge, className = '' }: { icon?: string; emoji?: string; label: string; onClick: () => void; badge?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pointer-events-auto relative w-[3.9rem] rounded-2xl bg-gradient-to-b from-[#2a5d93] to-[#173f6b] border-2 border-white/80 shadow-lg pt-1 pb-1 flex flex-col items-center ${className}`}
    >
      {icon ? <img src={icon} alt="" className="h-8 object-contain" /> : <span className="h-8 text-2xl leading-8" aria-hidden>{emoji}</span>}
      <span className="text-[10px] font-bold text-white leading-tight">{label}</span>
      {badge && <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-coral border-2 border-white text-white text-[11px] font-black grid place-items-center">!</span>}
    </button>
  );
}

/** The latest happenings (scripted events, admissions, chapter news), newest first. */
function EventLog() {
  const t = useT();
  const log = useGame((s) => s.game.log);
  const items = [...log].reverse().slice(0, 40);
  if (!items.length) return <p className="text-sm text-ink-soft">{t('hud.events_empty')}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((l) => (
        <li key={l.id} className={`rounded-xl bg-white border px-3 py-2 text-sm flex gap-2 ${l.level === 'good' ? 'border-ok/40' : l.level === 'warn' ? 'border-warn/40' : 'border-line'}`}>
          <span className="text-[11px] text-ink-soft tabular shrink-0 pt-0.5">
            D{dayOf(l.at)} {formatClock(l.at)}
          </span>
          <span className={l.level === 'good' ? 'text-ok' : l.level === 'warn' ? 'text-warn' : ''}>{t(l.key, l.params)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Build / Residents / Report shortcut cards above the tab bar (map view). */
function ActionCards() {
  const t = useT();
  const residents = useGame((s) => s.game.residents.length);
  const applicants = useGame((s) => s.game.applicants.length);
  const setSheet = useGame((s) => s.setSheet);
  const setLeftTab = useGame((s) => s.setLeftTab);
  const setView = useGame((s) => s.setView);
  const card = 'relative h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 overflow-visible';
  const badge = (n: number) =>
    n > 0 && <span className="absolute -top-1.5 right-1 min-w-5 h-5 px-1 rounded-full bg-coral text-white text-[11px] font-bold grid place-items-center tabular">{n}</span>;
  return (
    <div className="shrink-0 bg-white/95 border-t border-line px-2 py-1.5 grid grid-cols-4 gap-1.5">
      <button
        type="button"
        data-tour="m-build"
        onClick={() => {
          setLeftTab('build');
          setSheet('tools');
        }}
        className={`${card} bg-gradient-to-b from-[#26b383] to-[#138a62] text-white shadow`}
      >
        <img src={hatIcon} alt="" className="h-7 object-contain" />
        <span className="font-black text-[12px] leading-none">{t('hud.build')}</span>
      </button>
      {/* Hiring is always one tap away. */}
      <button
        type="button"
        onClick={() => {
          setLeftTab('hire');
          setSheet('tools');
        }}
        className={`${card} bg-[#fff1d6] text-[#14365f]`}
      >
        <img src={staffIcon} alt="" className="h-7 object-contain" />
        <span className="font-bold text-[12px] leading-none">{t('hud.hire')}</span>
        {badge(applicants)}
      </button>
      <button type="button" onClick={() => setView('residents')} className={`${card} bg-[#e3f0fb] text-[#14365f]`}>
        <img src={peopleIcon} alt="" className="h-7 object-contain" />
        <span className="font-bold text-[12px] leading-none">{t('hud.residents')}</span>
        {badge(residents)}
      </button>
      <button type="button" onClick={() => setSheet('report')} className={`${card} bg-[#e3f0fb] text-[#14365f]`}>
        <img src={chartIcon} alt="" className="h-7 object-contain" />
        <span className="font-bold text-[12px] leading-none">{t('hud.report')}</span>
      </button>
    </div>
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
      <AccountRow />
      <PrefsList />
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
  const showLabels = useGame((s) => s.showLabels);
  const setShowLabels = useGame((s) => s.setShowLabels);
  const exterior = useGame((s) => s.exterior);
  const setExterior = useGame((s) => s.setExterior);
  const autoOn = useAutoOn();
  const nextChapter = useGame((s) => nextChapterAvailable(s.game));
  const missionBadge = useGame((s) => !!s.game.chapter.result) && !nextChapter;

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
    tool.kind === 'room'
      ? t(`room.${tool.roomType}`)
      : tool.kind === 'decor'
        ? t(`decor.${tool.decor}`)
        : tool.kind === 'prefab'
          ? t(`prefab.${tool.prefab}`)
          : tool.kind === 'corridor'
            ? t('tool.corridor')
            : t('tool.bulldoze');

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {view !== 'map' && <MobileTopBar alertCount={alertCount} overlay={false} />}

      <main className="relative flex-1 min-h-0">
        <CenterArea showTabs={false} />
        {view === 'map' && <MobileTopBar alertCount={alertCount} overlay />}
        {view === 'map' && (
          <>
            <div className="absolute left-2 right-2 top-[5.6rem] z-10 flex items-start gap-2 pointer-events-none">
              {placing ? (
                <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-teal text-white pl-3 pr-1 py-1 shadow-lg">
                  <span className="text-sm font-semibold">{t('m.placing', { what: toolName })}</span>
                  {tool.kind === 'prefab' && (
                    <button type="button" onClick={() => setTool({ ...tool, rotated: !tool.rotated })} className="px-2.5 py-1.5 rounded-lg bg-white/20 text-sm font-bold" aria-label={t('prefab.rotate')}>
                      ⟳
                    </button>
                  )}
                  <button type="button" onClick={() => setTool({ kind: 'select' })} className="px-3 py-1.5 rounded-lg bg-white text-teal text-sm font-bold">
                    {t('m.done')}
                  </button>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <MissionCard />
                </div>
              )}
            </div>
            {!placing && (
              <>
                <div className="absolute left-2 top-[11.2rem] z-10 flex flex-col gap-2 pointer-events-none">
                  <FloatButton icon={clipIcon} label={t('hud.missions')} onClick={() => setSheet('missions')} badge={missionBadge} />
                  <FloatButton
                    emoji="🤖"
                    label={t(autoOn ? 'auto.on' : 'hud.auto')}
                    onClick={() => useGame.getState().setAutoOpen(true)}
                    className={autoOn ? '!from-[#f2b631] !to-[#d9901a]' : ''}
                  />
                  <FloatButton emoji="🏙️" label={t('hud.city')} onClick={() => useGame.getState().setCityOpen('city')} />
                </div>
                <div className="absolute right-2 top-[11.2rem] z-10 flex flex-col gap-2 pointer-events-none">
                  <FloatButton icon={eventsIcon} label={t('hud.events')} onClick={() => setSheet('events')} />
                  <FloatButton icon={trophyIcon} label={t('hud.rewards')} onClick={() => useGame.getState().setChaptersOpen(true)} badge={!!nextChapter} />
                  <FloatButton
                    icon={shopIcon}
                    label={t('hud.shop')}
                    onClick={() => useGame.getState().setShopOpen(true)}
                  />
                </div>
              </>
            )}
            <div className="absolute left-2 bottom-2 z-10 pointer-events-none">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('he:recenter'))}
                className="pointer-events-auto w-[4.4rem] rounded-2xl bg-gradient-to-b from-[#26b383] to-[#138a62] border-2 border-white/85 shadow-lg pt-1 pb-1 flex flex-col items-center"
              >
                <img src={mapIcon} alt="" className="h-8" />
                <span className="text-[10px] font-bold text-white leading-tight">{t('hud.overview')}</span>
              </button>
            </div>
            <div className="absolute right-2 bottom-2 z-10 pointer-events-none flex gap-2">
              <button
                type="button"
                onClick={() => setExterior(!exterior)}
                aria-pressed={exterior}
                title={t(exterior ? 'canvas.interior' : 'canvas.exterior')}
                aria-label={t(exterior ? 'canvas.interior' : 'canvas.exterior')}
                className={`pointer-events-auto size-12 rounded-2xl border-2 shadow-lg grid place-items-center text-2xl ${exterior ? 'bg-white border-white' : 'bg-[#14365f]/85 border-white/60'}`}
              >
                🏠
              </button>
              <button
                type="button"
                onClick={() => setShowLabels(!showLabels)}
                aria-pressed={showLabels}
                title={t('hud.labels')}
                aria-label={t('hud.labels')}
                className={`pointer-events-auto size-12 rounded-2xl border-2 shadow-lg grid place-items-center ${showLabels ? 'bg-white border-white text-[#14365f]' : 'bg-[#14365f]/85 border-white/60 text-white'}`}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
                  <path d="M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5" />
                </svg>
              </button>
            </div>
          </>
        )}
      </main>

      {view === 'map' && !placing && <ActionCards />}

      <nav className="shrink-0 grid grid-cols-5 bg-paper border-t border-line" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="views">
        {tabs.map((x) => {
          const active = x.id === 'manage' ? sheet === 'tools' : view === x.id && !sheet;
          return (
            <button
              key={x.id}
              type="button"
              data-tour={`nav-${x.id}`}
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
      {sheet === 'missions' && (
        <Sheet title={t('hud.missions_title', { c: game.chapter.id })} onClose={() => setSheet(null)}>
          <ObjectiveList />
        </Sheet>
      )}
      {sheet === 'events' && (
        <Sheet title={t('hud.events_title')} onClose={() => setSheet(null)}>
          <EventLog />
        </Sheet>
      )}
      {sheet === 'report' && (
        <Sheet title={t('hud.report')} onClose={() => setSheet(null)}>
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
