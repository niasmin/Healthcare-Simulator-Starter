import { useEffect, useState, type ReactNode } from 'react';
import hero from '../../assets/title/hero.jpg';
import ceoFace from '../../assets/faces/owner_f_smile.png';
import { formatTHB } from '../../domain/money';
import type { SlotInfo } from '../../storage/saves';
import { localeOf } from '../i18n';
import { useT } from '../hooks';
import { initCloud, saves, useSaveStatus } from '../saveService';
import { useGame } from '../store';
import { SaveModal } from './SaveModal';
import type { GameTemplate } from '../../sim/templates';
import { ROADMAP_CHAPTERS } from '../../data/chapters';

const icons = import.meta.glob('../../assets/title/ic_*.png', { eager: true, import: 'default' }) as Record<string, string>;
const icon = (n: string) => icons[`../../assets/title/ic_${n}.png`];

/** Business cards along the bottom: which chapter each one belongs to (null = later version). */
const CARDS: Array<{ id: string; chapter: number | null }> = [
  { id: 'nursing', chapter: 1 },
  { id: 'tranquila', chapter: 3 },
  { id: 'homecare', chapter: 4 },
  { id: 'neuro', chapter: 6 },
  { id: 'rehab', chapter: 1 },
  { id: 'staff', chapter: 5 },
  { id: 'inventory', chapter: null },
  { id: 'management', chapter: 1 },
  { id: 'achievement', chapter: 1 },
];
/** Chapters playable in this version. */
const PLAYABLE = 4;

type Panel = 'new' | 'help' | 'news' | null;

function SideButton({ label, icon: glyph, onClick, locked }: { label: string; icon: string; onClick?: () => void; locked?: boolean }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={locked ? t('home.soon') : label}
      className="relative w-16 sm:w-[4.5rem] rounded-2xl bg-[#1f4f8a]/85 border-2 border-white/70 text-white shadow-lg py-1.5 flex flex-col items-center gap-0.5 disabled:opacity-60 hover:brightness-110"
    >
      <span className="text-xl leading-none" aria-hidden>
        {glyph}
      </span>
      <span className="text-[10px] sm:text-[11px] font-semibold leading-tight px-0.5 text-center break-words">{label}</span>
      {locked && <span className="absolute -top-1.5 -right-1.5 text-[10px] bg-ink text-white rounded-full px-1">🔒</span>}
    </button>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5 rounded-full bg-[#14365f]/80 border border-white/40 text-white pl-1 pr-3 py-0.5 text-sm font-bold tabular shadow">{children}</div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-3" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-2xl bg-paper text-ink shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">{title}</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Opening screen in the style of the Healthcare Empire key art. Every button is real; unbuilt features say so. */
export function TitleScreen() {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  const setStarted = useGame((s) => s.setStarted);
  const newGame = useGame((s) => s.newGame);
  const loadGame = useGame((s) => s.loadGame);
  const notify = useGame((s) => s.notify);
  const openChapters = () => useGame.getState().setChaptersOpen(true);
  const version = useSaveStatus((s) => s.version);
  const cloud = useSaveStatus((s) => s.cloud);
  const [latest, setLatest] = useState<SlotInfo | null | undefined>(undefined);
  const [loadOpen, setLoadOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

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
  const resume = async () => {
    if (!latest) return;
    const r = await saves.load(latest.slot);
    if (!r.ok) return notify(`save.err.${r.error}`, 'error');
    loadGame(r.state);
  };
  const meta = latest?.meta;
  const money = (v: number) => formatTHB(v, localeOf(lang));
  const chapter = meta?.chapter ?? 1;
  const won = meta?.chaptersWon ?? 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-[#2b5d3b] text-white" role="dialog" aria-modal="true" aria-label={t('app.title')}>
      <img src={hero} alt="" className="absolute inset-0 size-full object-cover object-[22%_35%] sm:object-left-top" draggable={false} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-45% to-[#173a2a]/90" />

      <div className="relative min-h-full flex flex-col p-3 sm:p-5 gap-3">
        {/* Top row: logo, player card, figures from the latest save, language */}
        <header className="flex flex-wrap items-start gap-3">
          <div className="select-none drop-shadow-[0_3px_0_rgba(0,0,0,0.25)]">
            <div className="text-[2.1rem] sm:text-5xl font-black leading-none tracking-tight" style={{ WebkitTextStroke: '2px #1d4f7a', color: '#5fd0f2' }}>
              Healthcare
            </div>
            <div className="text-[2.4rem] sm:text-6xl font-black leading-none -mt-1" style={{ WebkitTextStroke: '2px #8a4a12', color: '#ffc531' }}>
              EMPIRE
            </div>
            <div className="mt-1 inline-block rounded-md bg-[#7a3f12] px-2 py-0.5 text-[11px] sm:text-xs font-bold tracking-wider">NURSING HOME TYCOON</div>
            <div className="mt-1 text-xs sm:text-sm font-semibold text-[#3a2a12] bg-[#fff5dd]/90 rounded-full px-2.5 py-0.5 w-fit">{t('home.tagline')}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-[#14365f]/80 border border-white/40 pl-1 pr-3 py-1 shadow">
              <img src={ceoFace} alt="" className="size-10 rounded-full bg-white/90 object-cover" />
              <div className="leading-tight">
                <div className="text-sm font-bold">{t('home.manager')}</div>
                <div className="text-[11px] text-white/85 tabular">{t('home.level', { c: chapter, won, total: ROADMAP_CHAPTERS })}</div>
                <div className="mt-0.5 h-1.5 w-24 rounded-full bg-white/25 overflow-hidden">
                  <div className="h-full bg-[#7ee07a]" style={{ width: `${(won / ROADMAP_CHAPTERS) * 100}%` }} />
                </div>
              </div>
            </div>
            <Pill>
              <span className="text-lg" aria-hidden>
                🪙
              </span>
              {meta ? money(meta.cashSatang) : '—'}
            </Pill>
            <Pill>
              <span className="text-lg" aria-hidden>
                👥
              </span>
              {meta ? meta.residents : '—'}
            </Pill>
            <Pill>
              <span className="text-lg" aria-hidden>
                ⭐
              </span>
              {meta ? Math.round(meta.reputation) : '—'}
            </Pill>
            <button type="button" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} className="rounded-xl bg-[#14365f]/80 border border-white/40 px-3 py-1.5 text-sm font-bold">
              🌐 {t('top.lang')}
            </button>
          </div>
        </header>

        {/* Side menus */}
        <div className="flex-1 flex justify-between items-start gap-2 min-h-[10rem]">
          <nav className="flex flex-row sm:flex-col gap-2 flex-wrap" aria-label={t('home.menu')}>
            <SideButton label={t('home.missions')} icon="📋" onClick={openChapters} />
            <SideButton label={t('home.guide')} icon="📖" onClick={() => setPanel('help')} />
            <SideButton label={t('home.shop')} icon="🏪" locked />
            <SideButton label={t('home.ranking')} icon="🏆" locked />
          </nav>
          <nav className="flex flex-row sm:flex-col gap-2" aria-label={t('home.more')}>
            <SideButton label={t('home.news')} icon="📣" onClick={() => setPanel('news')} />
          </nav>
        </div>

        {/* Main actions */}
        <div className="grid sm:grid-cols-3 gap-2 sm:gap-3 w-full max-w-4xl mx-auto">
          <button
            type="button"
            autoFocus={!!meta}
            disabled={!meta}
            onClick={resume}
            className="rounded-2xl border-[3px] border-white/80 bg-gradient-to-b from-[#3ea0ff] to-[#1b62d6] px-4 py-2.5 shadow-xl text-left flex items-center gap-3 disabled:opacity-55 hover:brightness-110"
          >
            <span className="text-3xl" aria-hidden>
              📍
            </span>
            <span>
              <span className="block text-xl font-black leading-tight">{t('title.continue')}</span>
              <span className="block text-xs text-white/90 tabular">{meta ? t('title.continue_sub', { day: meta.day, cash: money(meta.cashSatang) }) : t('home.no_save')}</span>
            </span>
          </button>
          <button
            type="button"
            autoFocus={!meta}
            onClick={() => setPanel('new')}
            className="rounded-2xl border-[3px] border-white/80 bg-gradient-to-b from-[#ffb22e] to-[#f07a12] px-4 py-2.5 shadow-xl text-left flex items-center gap-3 hover:brightness-110"
          >
            <span className="text-3xl" aria-hidden>
              ▶️
            </span>
            <span>
              <span className="block text-xl font-black leading-tight">{t('title.new')}</span>
              <span className="block text-xs text-white/90">New Game</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setLoadOpen(true)}
            className="rounded-2xl border-[3px] border-white/80 bg-gradient-to-b from-[#2fd17e] to-[#13945a] px-4 py-2.5 shadow-xl text-left flex items-center gap-3 hover:brightness-110"
          >
            <span className="text-3xl" aria-hidden>
              ☁️
            </span>
            <span>
              <span className="block text-xl font-black leading-tight">{t('home.saves')}</span>
              <span className="block text-xs text-white/90">{t(cloud === 'on' ? 'home.cloud_on' : cloud === 'connecting' ? 'home.cloud_wait' : 'home.cloud_off')}</span>
            </span>
          </button>
        </div>

        {/* Modes */}
        <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#14365f]/80 border border-white/30 p-1 flex gap-1 overflow-x-auto" role="tablist" aria-label={t('home.modes')}>
          <button type="button" role="tab" aria-selected className="flex-1 min-w-0 rounded-xl bg-white text-[#14365f] px-1.5 sm:px-4 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap">
            🏠 {t('home.mode_normal')}
          </button>
          <button type="button" role="tab" aria-selected={false} disabled title={t('home.soon')} className="flex-1 min-w-0 rounded-xl px-1.5 sm:px-4 py-1.5 text-xs sm:text-sm text-white/75 whitespace-nowrap">
            📊 {t('home.mode_challenge')} 🔒
          </button>
          <button type="button" role="tab" aria-selected={false} disabled title={t('home.soon')} className="flex-1 min-w-0 rounded-xl px-1.5 sm:px-4 py-1.5 text-xs sm:text-sm text-white/75 whitespace-nowrap">
            ⚙️ {t('home.mode_sandbox')} 🔒
          </button>
        </div>

        {/* Businesses */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x" aria-label={t('home.businesses')}>
          {CARDS.map((c) => {
            const open = c.chapter !== null && c.chapter <= PLAYABLE;
            return (
              <button
                key={c.id}
                type="button"
                onClick={openChapters}
                className={`snap-start shrink-0 w-[6.6rem] sm:w-[7.6rem] rounded-2xl bg-[#fbf6ec] text-ink border border-white shadow-lg p-1.5 flex flex-col items-center text-center ${open ? '' : 'opacity-70'}`}
              >
                <img src={icon(c.id)} alt="" className={`h-12 sm:h-14 w-full object-contain ${open ? '' : 'grayscale-[55%]'}`} draggable={false} />
                <span className="text-xs font-bold leading-tight mt-0.5">{t(`home.card.${c.id}`)}</span>
                <span className="text-[10px] text-ink-soft leading-tight">{t(`home.card.${c.id}.th`)}</span>
                <span className={`mt-0.5 text-[10px] font-semibold rounded-full px-1.5 ${open ? 'bg-ok/15 text-ok' : 'bg-ink/10 text-ink-soft'}`}>
                  {c.chapter === null ? `🔒 ${t('home.soon')}` : open ? t('home.card_chapter', { c: c.chapter }) : `🔒 ${t('home.card_chapter', { c: c.chapter })}`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-white/70 text-center">{t('title.note')}</p>
      </div>

      {panel === 'new' && (
        <Modal title={t('title.new')} onClose={() => setPanel(null)}>
          <button type="button" autoFocus onClick={() => begin('starter')} className="rounded-xl bg-coral text-white p-3 text-left shadow hover:brightness-110">
            <span className="block font-bold">🏥 {t('title.tpl_starter')}</span>
            <span className="block text-xs text-white/90 mt-0.5 leading-snug">{t('title.tpl_starter_sub')}</span>
          </button>
          <button type="button" onClick={() => begin('empty')} className="rounded-xl bg-white border border-line p-3 text-left hover:border-teal">
            <span className="block font-bold">🌱 {t('title.tpl_empty')}</span>
            <span className="block text-xs text-ink-soft mt-0.5 leading-snug">{t('title.tpl_empty_sub')}</span>
          </button>
          {meta && <p className="text-xs text-warn">{t('home.new_warning')}</p>}
        </Modal>
      )}
      {panel === 'help' && (
        <Modal title={t('home.guide')} onClose={() => setPanel(null)}>
          <ol className="list-decimal pl-5 text-sm leading-relaxed flex flex-col gap-1">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <li key={n}>{t(`home.help${n}`)}</li>
            ))}
          </ol>
        </Modal>
      )}
      {panel === 'news' && (
        <Modal title={t('home.news')} onClose={() => setPanel(null)}>
          <ul className="list-disc pl-5 text-sm leading-relaxed flex flex-col gap-1">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>{t(`home.news${n}`)}</li>
            ))}
          </ul>
        </Modal>
      )}
      {loadOpen && <SaveModal mode="title" onClose={() => setLoadOpen(false)} />}
    </div>
  );
}
