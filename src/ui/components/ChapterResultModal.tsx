import { chapterDef } from '../../data/chapters';
import { nextChapterAvailable } from '../../sim/systems/chapter';
import { useT } from '../hooks';
import { useGame } from '../store';
import { ChapterChecks } from './Tutorial';

/** The chapter verdict, shown once when the engine decides it (the game pauses at that midnight). */
export function ChapterResultModal() {
  const t = useT();
  const result = useGame((s) => s.game.chapter.result);
  const next = useGame((s) => nextChapterAvailable(s.game));
  const startDay = useGame((s) => s.game.chapter.startDay);
  const seen = useGame((s) => s.chapterSeen);
  const setSeen = useGame((s) => s.setChapterSeen);
  if (!result || seen) return null;
  const won = result.outcome === 'won';
  const c = result.chapter;
  const n = chapterDef(c).days;
  const name = t(`chapters.c${c}.title`);
  const restart = () => {
    const st = useGame.getState();
    st.newGame();
    st.setStarted(true);
  };
  const startNext = () => {
    const st = useGame.getState();
    st.dispatch({ type: 'startChapter' });
    setSeen(false);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-labelledby="chapter-result-title">
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl">
        <div className={`p-4 text-white ${won ? 'bg-teal' : 'bg-bad'}`}>
          <div className="text-3xl" aria-hidden>
            {won ? '🏆' : '📉'}
          </div>
          <h2 id="chapter-result-title" className="font-bold text-lg leading-snug mt-1">
            {t(won ? 'chapter.won.title' : 'chapter.failed.title', { c, name })}
          </h2>
          <p className="text-sm text-white/90 mt-1 leading-relaxed">
            {won
              ? `${t(`chapter.won.body${c}`, { n })} ${next ? t('chapter.won.next', { c: next, name: t(`chapters.c${next}.title`) }) : t('chapter.won.later')}`
              : t(`chapter.failed.${result.reason}`, { day: result.day, n })}
          </p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div>
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1.5">
              {t('chapter.result')} · {t('chapter.day', { day: Math.min(result.day - startDay + 1, n), n })}
            </h3>
            <ChapterChecks checks={result.checks} />
          </div>
          {!won && <p className="text-xs text-ink-soft leading-relaxed">{t('chapter.tips')}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            {!won && (
              <button type="button" onClick={restart} className="px-4 py-2 rounded-lg bg-white border border-line text-sm font-semibold">
                {t('chapter.retry')}
              </button>
            )}
            {!won && (
              <button
                type="button"
                onClick={() => {
                  if (useGame.getState().dispatch({ type: 'retryChapter' }).ok) setSeen(false);
                }}
                className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-bold"
              >
                ↻ {t('chapter.retry_chapter')}
              </button>
            )}
            <button type="button" onClick={() => setSeen(true)} className={`px-4 py-2 rounded-lg text-sm font-bold ${next ? 'bg-white border border-line' : 'bg-teal text-white'}`}>
              {t('chapter.continue')}
            </button>
            {next && (
              <button type="button" onClick={startNext} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-bold">
                {t('chapter.start', { c: next, name: t(`chapters.c${next}.title`) })} →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
