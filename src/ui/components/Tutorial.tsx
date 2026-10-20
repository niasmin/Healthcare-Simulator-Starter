import { useEffect, useMemo, useRef, useState } from 'react';
import { chapterDef } from '../../data/chapters';
import { buildObjectives, type GuideAction, type Objective } from '../../sim/selectors';
import { chapterChecks, nextChapterAvailable } from '../../sim/systems/chapter';
import { dayOf } from '../../sim/systems/time';
import type { ChapterCheck } from '../../domain/types';
import { isMobileNow, useMoney, useT } from '../hooks';
import { useGame } from '../store';
import clipIcon from '../../assets/hud/clip.png';
import giftIcon from '../../assets/hud/gift.png';
import { tourPointer, type TourPointer } from '../tour';

/** Open the part of the UI a tutorial step talks about. */
export function runGuideAction(a: GuideAction) {
  const st = useGame.getState();
  const mobile = isMobileNow();
  switch (a.kind) {
    case 'tool':
      st.setView('map');
      st.setLeftTab('build');
      st.setTool(a.tool === 'corridor' ? { kind: 'corridor' } : { kind: 'room', roomType: a.tool });
      if (mobile) st.setSheet(null);
      break;
    case 'select': {
      const room = st.game.site.rooms.find((r) => r.type === a.roomType);
      st.setView('map');
      st.setTool({ kind: 'select' });
      if (room) {
        st.select(room.id);
        if (mobile) st.setSheet('info');
      }
      break;
    }
    case 'tab':
      st.setLeftTab(a.tab);
      if (mobile) st.setSheet('tools');
      break;
    case 'view':
      st.setView(a.view);
      if (mobile) st.setSheet(null);
      break;
    case 'speed':
      st.dispatch({ type: 'setSpeed', speed: st.lastSpeed });
      break;
    case 'land':
    case 'decor':
      // Both live in the Build tab (the land button on top, the garden section below).
      st.setView('map');
      st.setLeftTab('build');
      if (mobile) st.setSheet('tools');
      break;
  }
}

/** Where the tutorial points right now: a control to ring and/or map tiles to suggest. */
export function useTourPointer(): TourPointer | null {
  const game = useGame((s) => s.game);
  const tool = useGame((s) => s.tool);
  const selectedRoomId = useGame((s) => s.selectedRoomId);
  const hidden = useGame((s) => s.tutorialHidden);
  const started = useGame((s) => s.started);
  return useMemo(() => {
    if (hidden || !started) return null;
    const goal = buildObjectives(game).find((g) => !g.done) ?? null;
    return tourPointer(goal, { game, tool, selectedRoomId });
  }, [game, tool, selectedRoomId, hidden, started]);
}

type Box = { left: number; top: number; width: number; height: number };

/** First on-screen element carrying one of the data-tour ids. */
function findTarget(ids: string[]): HTMLElement | null {
  for (const id of ids)
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) return el;
    }
  return null;
}

/**
 * Pulsing ring around the control the current tutorial step needs. Polls the layout (cheap) so it
 * follows sheets, tabs and scrolling; scrolls the control into view once; never blocks clicks.
 */
export function TourSpotlight() {
  const pointer = useTourPointer();
  const [box, setBox] = useState<Box | null>(null);
  const scrolled = useRef('');
  const sig = pointer?.targets.join('|') ?? '';
  useEffect(() => {
    const ids = sig ? sig.split('|') : [];
    const tick = () => {
      const el = ids.length ? findTarget(ids) : null;
      if (el && scrolled.current !== el.dataset.tour) {
        scrolled.current = el.dataset.tour ?? '';
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      const r = el?.getBoundingClientRect();
      setBox((prev) => {
        if (!r) return prev ? null : prev;
        const next = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
        return prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };
    tick();
    const iv = window.setInterval(tick, 200);
    return () => window.clearInterval(iv);
  }, [sig]);
  if (!box) return null;
  const pad = 4;
  return (
    <div
      aria-hidden
      data-testid="tour-ring"
      className="fixed z-[38] pointer-events-none rounded-xl border-[3px] border-coral tour-ring"
      style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
    />
  );
}

function useObjectives() {
  const game = useGame((s) => s.game);
  return useMemo(() => buildObjectives(game), [game]);
}

/** Toast each step the moment it is completed (mounted once, whether or not the card is shown). */
export function useTutorialToasts() {
  const t = useT();
  const goals = useObjectives();
  const prev = useRef<Set<string> | null>(null);
  useEffect(() => {
    const done = new Set(goals.filter((g) => g.done).map((g) => g.id));
    const before = prev.current;
    prev.current = done;
    // Only a growing set is progress; a new or loaded game just resets the baseline.
    if (!before || done.size <= before.size || [...before].some((id) => !done.has(id))) return;
    const fresh = goals.find((g) => g.done && !before.has(g.id));
    if (fresh) useGame.getState().notify('tut.step_done', 'ok', { goal: t(fresh.key, fresh.params) });
  }, [goals, t]);
}

export function ChapterChecks({ checks }: { checks: ChapterCheck[] }) {
  const t = useT();
  const money = useMoney();
  return (
    <ul className="flex flex-col gap-1">
      {checks.map((c) => (
        <li key={c.id} className="flex items-center gap-2 text-xs">
          <span className={`grid place-items-center size-4 rounded-full text-[10px] shrink-0 text-white ${c.ok ? 'bg-ok' : 'bg-bad'}`} aria-hidden>
            {c.ok ? '✓' : '✕'}
          </span>
          <span className="flex-1 min-w-0">{t(`chapter.check.${c.id}`, { need: c.need })}</span>
          <span className={`tabular shrink-0 font-semibold ${c.ok ? 'text-ok' : 'text-bad'}`}>
            {c.id === 'solvent' || c.id === 'cashflow' ? money(c.have) : `${c.have}/${c.need}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StepBody({ goal }: { goal: Objective }) {
  const t = useT();
  const game = useGame((s) => s.game);
  const checks = useMemo(() => (goal.id === 'chapter' ? chapterChecks(game) : null), [goal.id, game]);
  const days = chapterDef(game.chapter.id).days;
  const failed = goal.id === 'chapter' && game.chapter.result?.outcome === 'failed';
  return (
    <>
      <p className="text-xs leading-relaxed text-ink-soft">{t(goal.hint, goal.params)}</p>
      {checks && (
        <div className="rounded-lg bg-sand/60 p-2">
          <div className="text-[11px] font-semibold mb-1 tabular">{t('chapter.day', { day: Math.min(dayOf(game.minute) - game.chapter.startDay + 1, days), n: days })}</div>
          <ChapterChecks checks={checks} />
        </div>
      )}
      {failed && (
        <button type="button" onClick={() => useGame.getState().dispatch({ type: 'retryChapter' })} className="self-start px-3 py-1.5 rounded-lg bg-coral text-white text-xs font-bold">
          ↻ {t('chapter.retry_chapter')}
        </button>
      )}
    </>
  );
}

/**
 * Guided tutorial: the first unfinished chapter goal, how to do it, and a "Show me" button that
 * opens the right tool, tab or view. Steps are derived from the game state, so the guide is never
 * out of sync, even after loading a save. `compact` is the phone version (folds to one line).
 */
export function TutorialCard({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const goals = useObjectives();
  const hidden = useGame((s) => s.tutorialHidden);
  const chapter = useGame((s) => s.game.chapter.id);
  const next = useGame((s) => nextChapterAvailable(s.game));
  const setHidden = useGame((s) => s.setTutorialHidden);
  const [open, setOpen] = useState(!compact);
  const idx = goals.findIndex((g) => !g.done);
  const goal = idx >= 0 ? goals[idx] : null;
  const doneCount = goals.filter((g) => g.done).length;

  if (!goal && next && !hidden)
    return (
      <section className={`pointer-events-auto rounded-xl bg-white/97 border border-teal/40 shadow-lg px-3 py-2.5 flex flex-col gap-2 ${compact ? 'min-w-0 flex-1' : 'w-[340px]'} max-w-full`}>
        <div className="text-sm font-semibold">🏆 {t('tut.chapter_done', { c: chapter })}</div>
        <p className="text-xs text-ink-soft leading-relaxed">{t(`chapters.c${next}.desc`)}</p>
        <button type="button" onClick={() => useGame.getState().dispatch({ type: 'startChapter' })} className="self-start px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-bold">
          {t('chapter.start', { c: next, name: t(`chapters.c${next}.title`) })} →
        </button>
      </section>
    );

  if (hidden || !goal) {
    if (!goal && hidden) return null;
    return (
      <button
        type="button"
        onClick={() => setHidden(!goal)}
        className="pointer-events-auto rounded-xl bg-white/95 border border-line px-3 py-1.5 text-xs font-semibold shadow tabular"
      >
        📘 {goal ? t('tut.open', { n: doneCount, total: goals.length }) : t('tut.all_done')}
      </button>
    );
  }

  return (
    <section
      className={`pointer-events-auto rounded-xl bg-white/97 border border-teal/40 shadow-lg ${compact ? 'min-w-0 flex-1' : 'w-[340px]'} max-w-full`}
      aria-label={t('tut.header', { c: chapter, n: idx + 1, total: goals.length })}
    >
      <button type="button" onClick={() => compact && setOpen(!open)} className="w-full text-left px-3 pt-2 pb-1.5 flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] text-teal font-semibold tabular">{t('tut.header', { c: chapter, n: idx + 1, total: goals.length })}</span>
          <span className={`block text-sm font-semibold leading-snug ${compact && !open ? 'truncate' : ''}`}>
            {t(goal.key, goal.params)}
            {goal.progress && (
              <span className="ml-1.5 text-xs font-normal text-ink-soft tabular">
                {goal.progress.have}/{goal.progress.need}
              </span>
            )}
          </span>
        </span>
        {compact && <span className="text-ink-soft text-xs pt-3" aria-hidden>{open ? '▴' : '▾'}</span>}
      </button>
      <div className="h-1 mx-3 rounded-full bg-sand overflow-hidden" aria-hidden>
        <div className="h-full bg-teal" style={{ width: `${(doneCount / goals.length) * 100}%` }} />
      </div>
      {open && (
        <div className="px-3 pt-2 pb-2.5 flex flex-col gap-2">
          <StepBody goal={goal} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => runGuideAction(goal.action)} className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-bold">
              {t('tut.show')} →
            </button>
            <button type="button" onClick={() => setHidden(true)} className="ml-auto px-2 py-1.5 rounded-lg text-xs text-ink-soft hover:bg-sand">
              {t('tut.hide')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Phone mission card (play-screen concept art): clipboard, chapter step, goal and progress bar;
 * the gift opens the chapter road map (what this chapter unlocks next), ▾ unfolds the step.
 */
export function MissionCard() {
  const t = useT();
  const goals = useObjectives();
  const chapter = useGame((s) => s.game.chapter.id);
  const next = useGame((s) => nextChapterAvailable(s.game));
  const [open, setOpen] = useState(false);
  const idx = goals.findIndex((g) => !g.done);
  const goal = idx >= 0 ? goals[idx] : null;
  const doneCount = goals.filter((g) => g.done).length;
  const title = goal ? t(goal.key, goal.params) : next ? t('tut.chapter_done', { c: chapter }) : t('tut.all_done');
  return (
    <section className="pointer-events-auto rounded-2xl bg-white/97 shadow-lg border border-white" aria-label={t('tut.header', { c: chapter, n: Math.max(1, idx + 1), total: goals.length })}>
      <div className="flex items-center gap-2 pl-2 pr-1 py-1.5">
        <button type="button" onClick={() => useGame.getState().setSheet('missions')} className="shrink-0 size-12 rounded-xl bg-[#eef1ee] grid place-items-center" aria-label={t('hud.missions')}>
          <img src={clipIcon} alt="" className="h-10" />
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block text-[11px] text-ink-soft tabular">{t('tut.header', { c: chapter, n: goal ? idx + 1 : goals.length, total: goals.length })}</span>
          <span className={`block text-sm font-bold leading-snug ${open ? '' : 'truncate'}`}>
            {title}
            {goal?.progress && (
              <span className="ml-1.5 text-xs font-normal text-ink-soft tabular">
                {goal.progress.have}/{goal.progress.need}
              </span>
            )}
          </span>
          <span className="mt-1 block h-2 rounded-full bg-[#e3e6e3] overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full bg-gradient-to-r from-[#1fa36f] to-[#2bc183]" style={{ width: `${(doneCount / Math.max(1, goals.length)) * 100}%` }} />
          </span>
        </button>
        <span className="self-stretch w-px bg-line mx-0.5" aria-hidden />
        <button type="button" onClick={() => useGame.getState().setChaptersOpen(true)} className="shrink-0 size-11 grid place-items-center" aria-label={t('hud.reward')}>
          <img src={giftIcon} alt="" className="h-9" />
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="shrink-0 px-1 text-ink-soft text-xs" aria-label={t('tut.show')}>
          {open ? '▲' : '▼'}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-2.5 flex flex-col gap-2">
          {goal ? (
            <>
              <StepBody goal={goal} />
              <button type="button" onClick={() => runGuideAction(goal.action)} className="self-start px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-bold">
                {t('tut.show')} →
              </button>
            </>
          ) : next ? (
            <>
              <p className="text-xs text-ink-soft leading-relaxed">{t(`chapters.c${next}.desc`)}</p>
              <button type="button" onClick={() => useGame.getState().dispatch({ type: 'startChapter' })} className="self-start px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-bold">
                {t('chapter.start', { c: next, name: t(`chapters.c${next}.title`) })} →
              </button>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Every step of the running chapter, ticked off, each with its "Show me" shortcut. */
export function ObjectiveList() {
  const t = useT();
  const goals = useObjectives();
  const setSheet = useGame((s) => s.setSheet);
  const current = goals.findIndex((g) => !g.done);
  return (
    <ol className="flex flex-col gap-1.5">
      {goals.map((g, i) => (
        <li key={g.id} className={`rounded-xl border px-3 py-2 flex items-center gap-2 ${i === current ? 'bg-white border-teal/50 shadow-sm' : 'bg-white/60 border-line'}`}>
          <span className={`grid place-items-center size-6 rounded-full text-xs font-bold shrink-0 ${g.done ? 'bg-ok text-white' : i === current ? 'bg-teal text-white' : 'bg-sand text-ink-soft'}`} aria-hidden>
            {g.done ? '✓' : i + 1}
          </span>
          <span className={`flex-1 min-w-0 text-sm ${g.done ? 'text-ink-soft line-through' : ''}`}>
            {t(g.key, g.params)}
            {g.progress && !g.done && <span className="ml-1 text-xs text-ink-soft tabular">{g.progress.have}/{g.progress.need}</span>}
          </span>
          {!g.done && (
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                runGuideAction(g.action);
              }}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-teal text-white text-xs font-bold"
            >
              {t('tut.show')}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
