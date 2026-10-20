import { useMemo } from 'react';
import { buildObjectives } from '../../sim/selectors';
import { CHAPTERS, ROADMAP_CHAPTERS } from '../../data/chapters';
import { nextChapterAvailable } from '../../sim/systems/chapter';
import { useT } from '../hooks';
import { useGame } from '../store';

const art = import.meta.glob('../../assets/chapters/*.jpg', { eager: true, import: 'default' }) as Record<string, string>;
const cardArt = (n: number) => art[`../../assets/chapters/ch${n}.jpg`];

/** The campaign road map from the concept art: playable chapters show their targets; later ones show what comes next. */
export function ChaptersModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const game = useGame((s) => s.game);
  const goals = useMemo(() => buildObjectives(game), [game]);
  const done = goals.filter((g) => g.done).length;
  const next = nextChapterAvailable(game);
  const won = new Set([...game.chapter.past, ...(game.chapter.result ? [game.chapter.result] : [])].filter((r) => r.outcome === 'won').map((r) => r.chapter));
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
          {Array.from({ length: ROADMAP_CHAPTERS }, (_, i) => i + 1).map((n) => {
            const def = CHAPTERS[n - 1];
            const current = n === game.chapter.id && !won.has(n);
            const status = won.has(n) ? 'done' : current ? 'current' : n === next ? 'next' : def ? 'after' : 'locked';
            const lit = status !== 'locked' && status !== 'after';
            return (
              <li key={n} className={`rounded-xl overflow-hidden border bg-white flex flex-col ${current || status === 'next' ? 'border-teal ring-2 ring-teal/40' : 'border-line'}`}>
                <div className="relative">
                  <img src={cardArt(n)} alt="" className={`w-full aspect-[3/4] object-cover object-bottom ${lit ? '' : 'grayscale-[60%] brightness-90'}`} draggable={false} />
                  <span className={`absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${status === 'locked' || status === 'after' ? 'bg-ink/70 text-white' : status === 'done' ? 'bg-ok text-white' : 'bg-teal text-white'}`}>
                    {status === 'done' ? `✓ ${t('chapters.done')}` : status === 'current' ? t('chapters.current') : status === 'next' ? t('chapters.ready') : status === 'after' ? `🔒 ${t('chapters.after', { c: n - 1 })}` : `🔒 ${t('chapters.locked')}`}
                  </span>
                </div>
                <div className="p-2 flex flex-col gap-0.5">
                  <div className="text-[10px] text-ink-soft tabular">{n}/{ROADMAP_CHAPTERS}</div>
                  <div className="text-sm font-semibold leading-tight">{t(`chapters.c${n}.title`)}</div>
                  <div className="text-[11px] text-ink-soft leading-snug">{t(`chapters.c${n}.desc`)}</div>
                  {def && (
                    <ul className="mt-1 text-[10px] text-ink-soft leading-snug list-disc pl-3.5">
                      <li>{t('chapters.t.days', { n: def.days })}</li>
                      <li>{t('chapters.t.beds', { n: def.targetBeds, r: def.targetResidents })}</li>
                      {def.targetRn && <li>{t('chapters.t.rn', { n: def.targetRn })}</li>}
                      {def.programmes && <li>{t('chapters.t.programmes')}</li>}
                      {def.targetPremium && <li>{t('chapters.t.premium', { n: def.targetPremium, s: def.targetPremiumSat ?? 0, a: def.targetAppeal ?? 0 })}</li>}
                      {def.targetClients && <li>{t('chapters.t.clients', { n: def.targetClients, p: Math.round((def.targetVisitRate ?? 0) * 100) })}</li>}
                      {def.targetCertified && <li>{t('chapters.t.workforce', { n: def.targetCertified, c: def.targetContracts ?? 0 })}</li>}
                      {def.targetConsults && <li>{t('chapters.t.hospital', { n: def.targetConsults, p: Math.round((def.targetConsultRate ?? 0) * 100), d: def.targetDischarges ?? 0 })}</li>}
                      <li>{t('chapters.t.profit', { q: def.targetQuality })}</li>
                    </ul>
                  )}
                  {current && <div className="text-[11px] font-semibold text-teal mt-1 tabular">{t('chapters.progress', { done, total: goals.length })}</div>}
                  {status === 'next' && (
                    <button type="button" onClick={() => { useGame.getState().dispatch({ type: 'startChapter' }); onClose(); }} className="mt-1.5 px-2 py-1 rounded-lg bg-teal text-white text-[11px] font-bold">
                      {t('chapter.start_short', { c: n })} →
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
