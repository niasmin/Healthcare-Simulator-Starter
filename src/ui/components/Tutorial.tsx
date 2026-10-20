import { useEffect, useMemo, useRef, useState } from 'react';
import { chapterDef } from '../../data/chapters';
import { buildObjectives, type GuideAction, type Objective } from '../../sim/selectors';
import { chapterChecks, nextChapterAvailable } from '../../sim/systems/chapter';
import { dayOf } from '../../sim/systems/time';
import type { ChapterCheck } from '../../domain/types';
import { isMobileNow, useMoney, useT } from '../hooks';
import { useGame } from '../store';

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
