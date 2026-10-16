import worldMap from '../../assets/world-map.jpg';
import { useT } from '../hooks';
import { useGame } from '../store';

/** Opening screen over the world-map concept art. */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink" role="dialog" aria-modal="true" aria-label={t('app.title')}>
      <img src={worldMap} alt="" className="absolute inset-0 size-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/40 via-35% to-transparent to-60%" />
      <div className="relative min-h-full flex flex-col justify-end items-center text-center text-white gap-3 px-4 pb-10 pt-40">
        <p className="text-sm tracking-[0.3em] uppercase text-white/80">Care &amp; Beyond</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight drop-shadow-lg">{t('app.title')}</h1>
        <p className="text-lg sm:text-xl text-white/90">{t('title.tagline')}</p>
        <p className="max-w-xl text-sm text-white/80 leading-relaxed">{t('title.goal')}</p>
        <div className="flex gap-2 mt-2">
          <button type="button" autoFocus onClick={onStart} className="px-8 py-3 rounded-xl bg-coral text-white text-lg font-bold shadow-lg hover:brightness-110">
            {t('title.start')}
          </button>
          <button type="button" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} className="px-4 py-3 rounded-xl border border-white/50 text-white hover:bg-white/10">
            {t('top.lang')}
          </button>
        </div>
        <p className="text-[11px] text-white/60 mt-2">{t('title.note')}</p>
      </div>
    </div>
  );
}
