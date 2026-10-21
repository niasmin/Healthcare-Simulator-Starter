import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { CITY_PLACES, MALL_DEAL_DAYS } from '../../data/city';
import type { CityPlace, GameState } from '../../domain/types';
import { RIVALS, rivalSite, townRanking, type CenterStats } from '../../sim/rivals';
import { cityBlocker, cityCost, mallDeal } from '../../sim/systems/city';
import { createInitialState } from '../../sim/state';
import { dayOf } from '../../sim/systems/time';
import { currentSeason, previousSeason, type RankRecord, type SeasonResult } from '../../storage/supabaseStore';
import { DAYS_PER_MONTH, dayInMonth, monthOfDay } from '../../data/finance';
import { useMoney, useT } from '../hooks';
import { displayName, rankEntry, rankOptedIn, setRankOptIn } from '../ranking';
import { supabase, useSaveStatus } from '../saveService';
import { useGame } from '../store';
import { useName } from './people';

const VisitCanvas = lazy(() => import('./VisitCanvas').then((m) => ({ default: m.VisitCanvas })));

/** The town map: places to visit, rival homes and your own, laid out in blocks between roads. */
type Spot = { kind: 'place'; id: CityPlace } | { kind: 'rival'; id: string } | { kind: 'you' } | { kind: 'scenery'; id: 'lake' | 'school' };
const BLOCKS: Spot[] = [
  { kind: 'place', id: 'coffee' },
  { kind: 'rival', id: 'aunrak' },
  { kind: 'place', id: 'park' },
  { kind: 'place', id: 'mall' },
  { kind: 'rival', id: 'lanthong' },
  { kind: 'you' },
  { kind: 'place', id: 'cake' },
  { kind: 'rival', id: 'ruentawan' },
  { kind: 'place', id: 'restaurant' },
  { kind: 'rival', id: 'jaidee' },
  { kind: 'scenery', id: 'lake' },
  { kind: 'rival', id: 'baansuan' },
];
const PLACE_ICON: Record<CityPlace, string> = { coffee: '☕', cake: '🍰', restaurant: '🍜', park: '🌳', mall: '🛍️' };
const PLACE_TONE: Record<CityPlace, string> = { coffee: 'bg-[#f3e3cf]', cake: 'bg-[#fbe0ea]', restaurant: 'bg-[#fde7c8]', park: 'bg-[#d9efd2]', mall: 'bg-[#dfe6f6]' };
const RIVAL_ICON: Record<string, string> = { standard: '🏠', premium: '🏡', value: '🏘️', rehab: '🏥' };

type Visit = { title: string; state: GameState };

export function CityModal({ tab: initialTab, onClose }: { tab: 'city' | 'ranking'; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState(initialTab);
  const [visit, setVisit] = useState<Visit | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (visit ? setVisit(null) : onClose());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, visit]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('city.title')} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">🏙️ {t('city.title')}</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <div className="flex gap-1 rounded-xl bg-sand p-1" role="tablist">
          {(['city', 'ranking'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold ${tab === id ? 'bg-white shadow text-ink' : 'text-ink-soft'}`}
            >
              {t(`city.tab.${id}`)}
            </button>
          ))}
        </div>
        {tab === 'city' ? <CityMap onVisit={setVisit} /> : <Ranking onVisit={setVisit} />}
      </div>
      {visit && <VisitOverlay visit={visit} onClose={() => setVisit(null)} />}
    </div>
  );
}

function useRivalVisit(onVisit: (v: Visit) => void) {
  const t = useT();
  const name = useName();
  const day = useGame((s) => dayOf(s.game.minute));
  return (id: string) => {
    const r = RIVALS.find((x) => x.id === id);
    if (r) onVisit({ title: t('city.visit_title', { name: name(r.name) }), state: rivalSite(r, day) });
  };
}

function CityMap({ onVisit }: { onVisit: (v: Visit) => void }) {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const started = useGame((s) => s.started);
  const dispatch = useGame((s) => s.dispatch);
  const [picked, setPicked] = useState<Spot>({ kind: 'you' });
  const visitRival = useRivalVisit(onVisit);
  const ranking = useMemo(() => townRanking(game, { th: t('city.you'), en: t('city.you') }), [game, t]);
  const rankOf = (id: string) => ranking.findIndex((r) => r.id === id) + 1;
  const same = (a: Spot, b: Spot) => a.kind === b.kind && ('id' in a ? 'id' in b && a.id === b.id : true);

  const label = (s: Spot): string =>
    s.kind === 'place' ? t(`city.place.${s.id}`) : s.kind === 'rival' ? name(RIVALS.find((r) => r.id === s.id)!.name) : s.kind === 'you' ? t('city.you') : t(`city.scenery.${s.id}`);
  const icon = (s: Spot): string =>
    s.kind === 'place' ? PLACE_ICON[s.id] : s.kind === 'rival' ? RIVAL_ICON[RIVALS.find((r) => r.id === s.id)!.style] : s.kind === 'you' ? '⭐' : '🏞️';
  const tone = (s: Spot): string => (s.kind === 'place' ? PLACE_TONE[s.id] : s.kind === 'you' ? 'bg-[#cfeee6] ring-2 ring-teal' : s.kind === 'rival' ? 'bg-white' : 'bg-[#cfe6f3]');

  return (
    <>
      <p className="text-xs text-ink-soft leading-relaxed">{t('city.intro')}</p>
      {/* Blocks between roads: the grey gaps are the streets. */}
      <div className="rounded-2xl bg-[#8d949c] p-2 grid grid-cols-4 gap-2" data-testid="city-map">
        {BLOCKS.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPicked(s)}
            aria-pressed={same(s, picked)}
            className={`relative rounded-xl ${tone(s)} min-h-[4.6rem] p-1.5 flex flex-col items-center justify-center gap-0.5 shadow-sm border-2 ${same(s, picked) ? 'border-[#f2b631]' : 'border-transparent'} hover:brightness-105`}
          >
            <span className="text-2xl leading-none" aria-hidden>
              {icon(s)}
            </span>
            <span className="text-[11px] font-semibold leading-tight text-center">{label(s)}</span>
            {(s.kind === 'rival' || s.kind === 'you') && (
              <span className="absolute top-1 right-1 text-[10px] font-bold rounded-full bg-ink/75 text-white px-1.5">#{rankOf(s.kind === 'you' ? 'you' : s.id)}</span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-white p-3 flex flex-col gap-2" data-testid="city-card">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {icon(picked)}
          </span>
          <h3 className="font-bold flex-1">{label(picked)}</h3>
        </div>
        {picked.kind === 'place' && (
          <PlaceCard
            place={picked.id}
            cost={cityCost(game, picked.id)}
            blocker={started ? cityBlocker(game, picked.id) : 'not_found'}
            deal={picked.id === 'mall' && mallDeal(game)}
            onGo={() => dispatch({ type: 'visitPlace', place: picked.id })}
            money={money}
          />
        )}
        {picked.kind === 'rival' && (
          <>
            <p className="text-xs text-ink-soft">{t(`city.style.${RIVALS.find((r) => r.id === picked.id)!.style}`)}</p>
            <StatsLine stats={ranking.find((r) => r.id === picked.id)!.stats} />
            <button type="button" onClick={() => visitRival(picked.id)} className="self-start px-3 py-1.5 rounded-lg bg-teal text-white text-sm font-semibold">
              🔍 {t('city.visit')}
            </button>
          </>
        )}
        {picked.kind === 'you' && (
          <>
            <p className="text-xs text-ink-soft">{t('city.you_desc', { rank: rankOf('you'), n: ranking.length })}</p>
            <StatsLine stats={ranking.find((r) => r.you)!.stats} />
          </>
        )}
        {picked.kind === 'scenery' && <p className="text-xs text-ink-soft">{t(`city.scenery.${picked.id}.desc`)}</p>}
      </div>
    </>
  );
}

function PlaceCard({ place, cost, blocker, deal, onGo, money }: { place: CityPlace; cost: number; blocker: string | null; deal: boolean; onGo: () => void; money: (n: number) => string }) {
  const t = useT();
  const def = CITY_PLACES[place];
  return (
    <>
      <p className="text-xs text-ink-soft leading-snug">{t(`city.place.${place}.desc`, { days: MALL_DEAL_DAYS })}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm tabular font-semibold">{cost ? money(cost) : t('city.free')}</span>
        {def.perStaff ? <span className="text-[11px] text-ink-soft">({t('city.per_staff', { amount: money(def.perStaff) })})</span> : null}
        {def.perResident ? <span className="text-[11px] text-ink-soft">({t('city.per_resident', { amount: money(def.perResident) })})</span> : null}
        {deal && <span className="text-[11px] font-semibold text-ok">✓ {t('city.deal_on')}</span>}
        <button type="button" disabled={!!blocker} onClick={onGo} className="ml-auto px-3 py-1.5 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-35">
          {t('city.go')}
        </button>
      </div>
      {blocker && blocker !== 'not_found' && <p className="text-[11px] text-warn">{t(`reason.${blocker}`)}</p>}
    </>
  );
}

function StatsLine({ stats }: { stats: CenterStats }) {
  const t = useT();
  return (
    <dl className="grid grid-cols-5 gap-1 text-center">
      {(
        [
          ['score', stats.score],
          ['residents', `${stats.residents}/${stats.beds}`],
          ['reputation', stats.reputation],
          ['satisfaction', stats.satisfaction],
          ['stars', stats.stars],
        ] as const
      ).map(([k, v]) => (
        <div key={k} className="rounded-lg bg-sand/70 py-1">
          <dt className="text-[10px] text-ink-soft">{t(`city.stat.${k}`)}</dt>
          <dd className="text-sm font-bold tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Ranking({ onVisit }: { onVisit: (v: Visit) => void }) {
  const t = useT();
  const name = useName();
  const game = useGame((s) => s.game);
  const visitRival = useRivalVisit(onVisit);
  const rows = useMemo(() => townRanking(game, { th: t('city.you'), en: t('city.you') }), [game, t]);
  return (
    <>
      <section className="flex flex-col gap-1.5">
        <h3 className="font-bold text-sm">{t('rank.town')}</h3>
        <p className="text-[11px] text-ink-soft">{t('rank.town_hint')}</p>
        <p className="text-[11px] font-semibold text-teal">
          🏆 {t('rank.town_season', { m: monthOfDay(dayOf(game.minute)), left: DAYS_PER_MONTH - dayInMonth(dayOf(game.minute)) + 1 })}
        </p>
        <ol className="flex flex-col gap-1" data-testid="town-ranking">
          {rows.map((r, i) => (
            <RankLine key={r.id} n={i + 1} name={name(r.name)} you={r.you} score={r.stats.score} detail={t('rank.detail', { res: r.stats.residents, beds: r.stats.beds, rep: r.stats.reputation })} onVisit={r.you ? undefined : () => visitRival(r.id)} />
          ))}
        </ol>
      </section>
      <OnlineRanking onVisit={onVisit} />
    </>
  );
}

function RankLine({ n, name, you, score, detail, onVisit }: { n: number; name: string; you: boolean; score: number; detail: string; onVisit?: () => void }) {
  const t = useT();
  const medal = n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : `${n}.`;
  return (
    <li className={`rounded-xl border px-2.5 py-1.5 flex items-center gap-2 ${you ? 'border-teal bg-teal/5' : 'border-line bg-white'}`}>
      <span className="w-7 text-center font-bold tabular">{medal}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{name}</div>
        <div className="text-[11px] text-ink-soft">{detail}</div>
      </div>
      <span className="text-sm font-bold tabular">{score}</span>
      {onVisit && (
        <button type="button" onClick={onVisit} className="px-2 py-1 rounded-lg bg-white border border-line text-xs font-semibold" title={t('city.visit')}>
          🔍
        </button>
      )}
    </li>
  );
}

/** Real players who chose to show their home, from Supabase (deployed site only). */
function OnlineRanking({ onVisit }: { onVisit: (v: Visit) => void }) {
  const t = useT();
  const game = useGame((s) => s.game);
  const started = useGame((s) => s.started);
  const provider = useSaveStatus((s) => s.provider);
  const account = useSaveStatus((s) => s.account);
  const [rows, setRows] = useState<RankRecord[] | null>(null);
  const [optIn, setOptIn] = useState(rankOptedIn());
  const [busy, setBusy] = useState(false);
  const me = supabase?.userId() ?? null;

  const [podium, setPodium] = useState<SeasonResult[]>([]);
  const [myTrophies, setMyTrophies] = useState<Array<{ season: string; rank: number }>>([]);
  const season = currentSeason();
  const load = async () => setRows((await supabase?.leaderboard()) ?? []);
  useEffect(() => {
    if (provider !== 'supabase' || !supabase) return;
    void load();
    // Last season's podium, and this player's podiums over the last six seasons.
    const conn = supabase;
    void (async () => {
      const seasons = [1, 2, 3, 4, 5, 6].map((k) => previousSeason(season, k));
      const results = await Promise.all(seasons.map((x) => conn.seasonResults(x)));
      setPodium(results[0].slice(0, 3));
      const id = conn.userId();
      setMyTrophies(results.flatMap((rs, i) => rs.filter((r) => r.user_id === id && r.rank <= 3).map((r) => ({ season: seasons[i], rank: r.rank }))));
    })();
  }, [provider, season]);

  const toggle = async () => {
    if (!supabase || !account) return;
    setBusy(true);
    const on = !optIn;
    const ok = on ? await supabase.publishRank(rankEntry(game, account)) : await supabase.withdrawRank();
    if (ok) {
      setRankOptIn(on);
      setOptIn(on);
      await load();
    } else useGame.getState().notify('rank.failed', 'error');
    setBusy(false);
  };

  const visitPlayer = async (r: RankRecord) => {
    const site = await supabase?.rankSite(r.user_id);
    if (!site) return useGame.getState().notify('rank.no_site', 'error');
    const base = createInitialState(1);
    onVisit({ title: t('city.visit_title', { name: r.home_name || r.display_name }), state: { ...base, site, organization: { ...base.organization, name: r.home_name ?? '' } } });
  };

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-bold text-sm">{t('rank.online')}</h3>
      {provider === 'supabase' && (
        <div className="rounded-xl bg-sand/70 px-2.5 py-1.5 text-[11px] flex flex-col gap-0.5" data-testid="online-season">
          <span className="font-semibold">🏆 {t('rank.season', { s: seasonLabel(season), left: daysLeftInMonth() })}</span>
          {podium.length > 0 && (
            <span className="text-ink-soft">
              {t('rank.last_podium', { s: seasonLabel(previousSeason(season)) })} {podium.map((p) => `${MEDAL[p.rank - 1] ?? ''} ${p.home_name || p.display_name}`).join(' · ')}
            </span>
          )}
          {myTrophies.length > 0 && <span className="font-semibold text-ok">{t('rank.my_trophies')} {myTrophies.map((x) => `${MEDAL[x.rank - 1]} ${seasonLabel(x.season)}`).join(' · ')}</span>}
        </div>
      )}
      {provider !== 'supabase' ? (
        <p className="text-[11px] text-ink-soft">{t('rank.online_site_only')}</p>
      ) : !account ? (
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-ink-soft flex-1">{t('rank.sign_in')}</p>
          <button type="button" onClick={() => useGame.getState().setAccountOpen(true)} className="px-3 py-1 rounded-lg bg-teal text-white text-xs font-semibold">
            👤 {t('rank.sign_in_btn')}
          </button>
        </div>
      ) : (
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={optIn} disabled={busy || (!started && !optIn)} onChange={() => void toggle()} className="mt-0.5" />
          <span>
            {t('rank.opt_in', { name: displayName(account) })}
            <span className="block text-[11px] text-ink-soft">{t('rank.opt_in_hint')}</span>
          </span>
        </label>
      )}
      {provider === 'supabase' &&
        (rows === null ? (
          <p className="text-[11px] text-ink-soft">{t('rank.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] text-ink-soft">{t('rank.empty')}</p>
        ) : (
          <ol className="flex flex-col gap-1" data-testid="online-ranking">
            {rows.map((r, i) => (
              <RankLine
                key={r.user_id}
                n={i + 1}
                name={r.home_name ? `${r.home_name} · ${r.display_name}` : r.display_name}
                you={r.user_id === me}
                score={r.score}
                detail={t('rank.detail_online', { res: r.residents, beds: r.beds, rep: r.reputation, day: r.day, c: r.chapter })}
                onVisit={r.user_id === me ? undefined : () => void visitPlayer(r)}
              />
            ))}
          </ol>
        ))}
    </section>
  );
}

function VisitOverlay({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[60] bg-ink/80 p-3 flex flex-col gap-2" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={visit.title}>
      <div className="flex items-center gap-2 text-white">
        <h3 className="font-bold flex-1 truncate">🔍 {visit.title}</h3>
        <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white text-ink text-sm font-semibold">
          {t('city.back')}
        </button>
      </div>
      <p className="text-[11px] text-white/80">{t('city.visit_hint')}</p>
      <div className="relative flex-1 rounded-2xl overflow-hidden bg-[#9fd38a]">
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-white">…</div>}>
          <VisitCanvas state={visit.state} />
        </Suspense>
      </div>
    </div>
  );
}


const MEDAL = ['🥇', '🥈', '🥉'];
/** "2026-10" → a month name in the page's language. */
function seasonLabel(season: string): string {
  const [y, m] = season.split('-').map(Number);
  const lang = document.documentElement.lang === 'en' ? 'en-US' : 'th-TH';
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function daysLeftInMonth(now = new Date()): number {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((end - now.getTime()) / 86_400_000));
}
