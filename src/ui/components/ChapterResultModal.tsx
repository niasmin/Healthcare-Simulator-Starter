import { STARTER_SCENARIO } from '../../data/scenarios';
import { useT } from '../hooks';
import { useGame } from '../store';
import { ChapterChecks } from './Tutorial';

/** The chapter verdict, shown once when the engine decides it (the game pauses at that midnight). */
export function ChapterResultModal() {
  const t = useT();
  const result = useGame((s) => s.game.chapter.result);
  const seen = useGame((s) => s.chapterSeen);
  const setSeen = useGame((s) => s.setChapterSeen);
  if (!result || seen) return null;
  const won = result.outcome === 'won';
  const n = STARTER_SCENARIO.targetDays;
  const restart = () => {
    const st = useGame.getState();
    st.newGame();
    st.setStarted(true);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-labelledby="chapter-result-title">
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl">
        <div className={`p-4 text-white ${won ? 'bg-teal' : 'bg-bad'}`}>
          <div className="text-3xl" aria-hidden>
            {won ? '🏆' : '📉'}
          </div>
          <h2 id="chapter-result-title" className="font-bold text-lg leading-snug mt-1">
            {t(won ? 'chapter.won.title' : 'chapter.failed.title')}
          </h2>
          <p className="text-sm text-white/90 mt-1 leading-relaxed">
            {won ? t('chapter.won.body', { n }) : t(`chapter.failed.${result.reason}`, { day: result.day, n })}
          </p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div>
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1.5">
              {t('chapter.result')} · {t('chapter.day', { day: result.day, n })}
            </h3>
            <ChapterChecks checks={result.checks} />
          </div>
          {!won && <p className="text-xs text-ink-soft leading-relaxed">{t('chapter.tips')}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={restart} className="px-4 py-2 rounded-lg bg-white border border-line text-sm font-semibold">
              {t('chapter.retry')}
            </button>
            <button type="button" onClick={() => setSeen(true)} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-bold">
              {t('chapter.continue')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
