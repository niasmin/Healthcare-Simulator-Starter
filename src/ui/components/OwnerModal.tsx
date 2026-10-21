import { useCallback, useEffect, useState } from 'react';
import type { OwnerStats } from '../../storage/supabaseStore';
import { useT } from '../hooks';
import { supabase } from '../saveService';

/**
 * The game owner's statistics (deployed site): players, sessions, how far they get, where chapters
 * are lost, and the latest feedback. Counts only, from public.owner_stats(), which answers nobody
 * but the owner's account.
 */
export function OwnerModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [stats, setStats] = useState<OwnerStats | null | 'loading'>('loading');
  const load = useCallback(() => {
    setStats('loading');
    void (supabase?.ownerStats() ?? Promise.resolve(null)).then(setStats);
  }, []);
  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('owner.title')} onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-testid="owner">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">📊 {t('owner.title')}</h2>
          <button type="button" onClick={load} className="px-3 py-1 rounded-lg bg-white border border-line text-sm">
            🔄 {t('owner.refresh')}
          </button>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        {stats === 'loading' ? <p className="text-sm text-ink-soft">…</p> : !stats ? <p className="text-sm">{t('owner.denied')}</p> : <Body s={stats} />}
      </div>
    </div>
  );
}

const MODE_KEY: Record<string, string> = { campaign: 'home.mode_normal', challenge: 'home.mode_challenge', sandbox: 'home.mode_sandbox' };

function Tile({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2">
      <div className="text-[11px] text-ink-soft">{label}</div>
      <div className="text-xl font-bold tabular">{value}</div>
      {sub && <div className="text-[10px] text-ink-soft">{sub}</div>}
    </div>
  );
}

function Bars({ rows, max }: { rows: Array<{ label: string; value: number; extra?: string }>; max: number }) {
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate" title={r.label}>
            {r.label}
          </span>
          <span className="flex-1 h-3 rounded-full bg-sand overflow-hidden">
            <span className="block h-full bg-teal rounded-full" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
          </span>
          <span className="w-16 text-right tabular font-semibold">
            {r.value}
            {r.extra ? <span className="font-normal text-ink-soft"> {r.extra}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Body({ s }: { s: OwnerStats }) {
  const t = useT();
  const T = s.totals;
  const dayMax = Math.max(1, ...s.daily.map((d) => d.sessions));
  const furthestMax = Math.max(1, ...s.furthest.map((f) => f.sessions));
  const tutMax = Math.max(1, ...s.tutorial.map((x) => x.sessions));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label={t('owner.sessions_1d')} value={T.sessions_1d} sub={t('owner.sessions_7d', { n: T.sessions_7d })} />
        <Tile label={t('owner.sessions_all')} value={T.sessions} sub={t('owner.sessions_30d', { n: T.sessions_30d })} />
        <Tile label={t('owner.play_hours')} value={(T.play_minutes_7d / 60).toFixed(1)} sub={t('owner.last7')} />
        <Tile label={t('owner.accounts')} value={T.accounts} sub={t('owner.guests', { n: T.guests })} />
        <Tile label={t('owner.cloud')} value={T.cloud_saves} />
        <Tile label={t('owner.ranked')} value={T.ranked} />
        <Tile label={t('owner.feedback')} value={T.feedback} />
        <Tile label={t('owner.modes')} value={Object.values(s.modes).reduce((a, b) => a + b, 0)} sub={Object.entries(s.modes).map(([m, n]) => `${t(MODE_KEY[m] ?? m)} ${n}`).join(' · ')} />
      </div>

      <section className="rounded-xl border border-line bg-white p-3">
        <h3 className="text-sm font-bold mb-2">{t('owner.daily')}</h3>
        <div className="flex items-end gap-1 h-28" aria-label={t('owner.daily')}>
          {s.daily.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.day}: ${d.sessions} / ${d.starts}`}>
              <span className="text-[9px] tabular">{d.sessions || ''}</span>
              <span className="w-full rounded-t bg-teal" style={{ height: `${(d.sessions / dayMax) * 80}px`, minHeight: d.sessions ? 3 : 0 }} />
              <span className="text-[9px] text-ink-soft">{d.day.slice(8, 10)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-3">
        <section className="rounded-xl border border-line bg-white p-3">
          <h3 className="text-sm font-bold mb-2">{t('owner.furthest')}</h3>
          <Bars rows={s.furthest.map((f) => ({ label: t('home.card_chapter', { c: f.chapter }), value: f.sessions }))} max={furthestMax} />
          <table className="w-full text-xs mt-3 tabular">
            <thead>
              <tr className="text-ink-soft">
                <th className="text-left font-semibold">{t('owner.chapter')}</th>
                <th className="text-right font-semibold">{t('owner.players')}</th>
                <th className="text-right font-semibold">{t('owner.won')}</th>
                <th className="text-right font-semibold">{t('owner.failed')}</th>
              </tr>
            </thead>
            <tbody>
              {s.chapters.map((c) => (
                <tr key={c.chapter} className="border-t border-line">
                  <td>{c.chapter}</td>
                  <td className="text-right">{c.players}</td>
                  <td className="text-right text-ok">{c.won}</td>
                  <td className="text-right text-bad">{c.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-xl border border-line bg-white p-3">
          <h3 className="text-sm font-bold mb-2">{t('owner.tutorial')}</h3>
          <Bars rows={s.tutorial.map((x) => ({ label: t(`goal.${x.goal}`), value: x.sessions }))} max={tutMax} />
          <h3 className="text-sm font-bold mt-3 mb-1">{t('owner.missed')}</h3>
          {s.missed.length ? (
            <ul className="text-xs flex flex-col gap-0.5">
              {s.missed.map((m) => (
                <li key={`${m.chapter}-${m.check}`} className="flex gap-2">
                  <span className="flex-1">
                    {t('home.card_chapter', { c: m.chapter })}: {t(`chapter.check.${m.check}`)}
                  </span>
                  <span className="tabular font-semibold">{m.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-soft">{t('owner.none')}</p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-line bg-white p-3">
        <h3 className="text-sm font-bold mb-2">💬 {t('owner.recent_feedback')}</h3>
        {s.recent_feedback.length ? (
          <ul className="flex flex-col gap-2">
            {s.recent_feedback.map((f, i) => (
              <li key={i} className="border-t border-line pt-2 first:border-0 first:pt-0 text-xs">
                <div className="flex gap-2 text-ink-soft">
                  <span className="font-semibold">{t(`comm.kind.${f.kind}`)}</span>
                  <span>{new Date(f.at).toLocaleString()}</span>
                  {f.contact && <span className="ml-auto">✉️ {f.contact}</span>}
                </div>
                <p className="whitespace-pre-line mt-0.5">{f.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-soft">{t('owner.no_feedback')}</p>
        )}
      </section>
      <p className="text-[11px] text-ink-soft">{t('owner.note', { at: new Date(s.generated_at).toLocaleString() })}</p>
    </div>
  );
}
