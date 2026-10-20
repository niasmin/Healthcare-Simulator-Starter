import { useEffect, useState } from 'react';
import worldMap from '../../assets/world-map.jpg';
import { formatTHB } from '../../domain/money';
import type { SlotInfo } from '../../storage/saves';
import { localeOf } from '../i18n';
import { useT } from '../hooks';
import { initCloud, saves, useSaveStatus } from '../saveService';
import { useGame } from '../store';
import { SaveModal } from './SaveModal';
import type { GameTemplate } from '../../sim/templates';

/** Opening screen over the world-map concept art, with Continue when a save exists. */
export function TitleScreen() {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  const setStarted = useGame((s) => s.setStarted);
  const newGame = useGame((s) => s.newGame);
  const loadGame = useGame((s) => s.loadGame);
  const notify = useGame((s) => s.notify);
  const version = useSaveStatus((s) => s.version);
  const [latest, setLatest] = useState<SlotInfo | null | undefined>(undefined);
  const [loadOpen, setLoadOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    let alive = true;
    initCloud()
      .then(() => saves.latest())
      .then((l) => alive && setLatest(l))
      .catch(() => alive && setLatest(null));
    return () => {
      alive = false;
    };
  }, [version]);

  const begin = (template: GameTemplate) => {
    newGame(template);
    setStarted(true);
  };
  const start = () => setChoosing(true);
  const resume = async () => {
    if (!latest) return;
    const r = await saves.load(latest.slot);
    if (!r.ok) return notify(`save.err.${r.error}`, 'error');
    loadGame(r.state);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink" role="dialog" aria-modal="true" aria-label={t('app.title')}>
      <img src={worldMap} alt="" className="absolute inset-0 size-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/40 via-35% to-transparent to-60%" />
      <div className="relative min-h-full flex flex-col justify-end items-center text-center text-white gap-3 px-4 pb-10 pt-40">
        <p className="text-sm tracking-[0.3em] uppercase text-white/80">Care &amp; Beyond</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight drop-shadow-lg">{t('app.title')}</h1>
        <p className="text-lg sm:text-xl text-white/90">{t('title.tagline')}</p>
        <p className="max-w-xl text-sm text-white/80 leading-relaxed">{t('title.goal')}</p>
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {latest?.meta ? (
            <>
              <button type="button" autoFocus onClick={resume} className="px-7 py-2.5 rounded-xl bg-coral text-white shadow-lg hover:brightness-110 text-left leading-tight">
                <span className="block text-lg font-bold">{t('title.continue')}</span>
                <span className="block text-xs text-white/85 tabular">
                  {t('title.continue_sub', { day: latest.meta.day, cash: formatTHB(latest.meta.cashSatang, localeOf(lang)) })}
                </span>
              </button>
              <button type="button" onClick={start} className="px-5 py-3 rounded-xl bg-white/15 border border-white/40 text-white font-semibold hover:bg-white/25">
                {t('title.new')}
              </button>
              <button type="button" onClick={() => setLoadOpen(true)} className="px-5 py-3 rounded-xl border border-white/40 text-white hover:bg-white/10">
                {t('title.load')}
              </button>
            </>
          ) : (
            <button type="button" autoFocus onClick={start} className="px-8 py-3 rounded-xl bg-coral text-white text-lg font-bold shadow-lg hover:brightness-110">
              {t('title.start')}
            </button>
          )}
          <button type="button" onClick={() => useGame.getState().setChaptersOpen(true)} className="px-4 py-3 rounded-xl border border-white/50 text-white hover:bg-white/10">
            {t('chapters.open')}
          </button>
          <button type="button" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} className="px-4 py-3 rounded-xl border border-white/50 text-white hover:bg-white/10">
            {t('top.lang')}
          </button>
        </div>
        {choosing && (
          <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl mt-1" role="group" aria-label={t('title.new')}>
            <button type="button" autoFocus onClick={() => begin('starter')} className="rounded-xl bg-coral text-white p-3 text-left shadow-lg hover:brightness-110">
              <span className="block font-bold">🏥 {t('title.tpl_starter')}</span>
              <span className="block text-xs text-white/85 mt-0.5 leading-snug">{t('title.tpl_starter_sub')}</span>
            </button>
            <button type="button" onClick={() => begin('empty')} className="rounded-xl bg-white/15 border border-white/40 text-white p-3 text-left hover:bg-white/25">
              <span className="block font-bold">🌱 {t('title.tpl_empty')}</span>
              <span className="block text-xs text-white/80 mt-0.5 leading-snug">{t('title.tpl_empty_sub')}</span>
            </button>
          </div>
        )}
        <p className="text-[11px] text-white/60 mt-2">{t('title.note')}</p>
      </div>
      {loadOpen && <SaveModal mode="title" onClose={() => setLoadOpen(false)} />}
    </div>
  );
}
