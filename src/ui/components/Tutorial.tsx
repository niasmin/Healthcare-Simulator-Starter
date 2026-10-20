import { useEffect, useMemo, useRef, useState } from 'react';
import { STARTER_SCENARIO } from '../../data/scenarios';
import { buildObjectives, type GuideAction, type Objective } from '../../sim/selectors';
import { chapterChecks } from '../../sim/systems/chapter';
import { dayOf } from '../../sim/systems/time';
import type { ChapterCheck } from '../../domain/types';
import { isMobileNow, useMoney, useT } from '../hooks';
import { useGame } from '../store';
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
  return (
    <>
      <p className="text-xs leading-relaxed text-ink-soft">{t(`tut.${goal.id}`, goal.params)}</p>
      {checks && (
        <div className="rounded-lg bg-sand/60 p-2">
          <div className="text-[11px] font-semibold mb-1 tabular">{t('chapter.day', { day: Math.min(dayOf(game.minute), STARTER_SCENARIO.targetDays), n: STARTER_SCENARIO.targetDays })}</div>
          <ChapterChecks checks={checks} />
        </div>
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
  const setHidden = useGame((s) => s.setTutorialHidden);
  const [open, setOpen] = useState(!compact);
  const idx = goals.findIndex((g) => !g.done);
  const goal = idx >= 0 ? goals[idx] : null;
  const doneCount = goals.filter((g) => g.done).length;

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
      aria-label={t('tut.header', { n: idx + 1, total: goals.length })}
    >
      <button type="button" onClick={() => compact && setOpen(!open)} className="w-full text-left px-3 pt-2 pb-1.5 flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] text-teal font-semibold tabular">{t('tut.header', { n: idx + 1, total: goals.length })}</span>
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
