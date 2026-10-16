import { useMemo } from 'react';
import { buildObjectives } from '../../sim/selectors';
import { useT } from '../hooks';
import { useGame } from '../store';

const art = import.meta.glob('../../assets/chapters/*.jpg', { eager: true, import: 'default' }) as Record<string, string>;
const cardArt = (n: number) => art[`../../assets/chapters/ch${n}.jpg`];

/** The campaign road map from the concept art: chapter 1 is playable, 2–7 are shown as what comes next. */
export function ChaptersModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const game = useGame((s) => s.game);
  const goals = useMemo(() => buildObjectives(game), [game]);
  const done = goals.filter((g) => g.done).length;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-ink/55 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="chapters-title" onClick={onClose}>
      <div
        className="w-full sm:max-w-5xl max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h2 id="chapters-title" className="font-bold text-lg flex-1">
            {t('chapters.title')}
          </h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => {
            const current = n === 1;
            return (
              <li key={n} className={`rounded-xl overflow-hidden border bg-white flex flex-col ${current ? 'border-teal ring-2 ring-teal/40' : 'border-line'}`}>
                <div className="relative">
                  <img src={cardArt(n)} alt="" className={`w-full aspect-[3/4] object-cover object-bottom ${current ? '' : 'grayscale-[60%] brightness-90'}`} draggable={false} />
                  <span className={`absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${current ? 'bg-teal text-white' : 'bg-ink/70 text-white'}`}>
                    {current ? t('chapters.current') : `🔒 ${t('chapters.locked')}`}
                  </span>
                </div>
                <div className="p-2 flex flex-col gap-0.5">
                  <div className="text-[10px] text-ink-soft tabular">{n}/7</div>
                  <div className="text-sm font-semibold leading-tight">{t(`chapters.c${n}.title`)}</div>
                  <div className="text-[11px] text-ink-soft leading-snug">{t(`chapters.c${n}.desc`)}</div>
                  {current && <div className="text-[11px] font-semibold text-teal mt-1 tabular">{t('chapters.progress', { done, total: goals.length })}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
