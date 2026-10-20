import { useMemo, useState } from 'react';
import { monthlyFee, PRICE_LEVELS } from '../../data/finance';
import type { LedgerCategory, RevenueStream } from '../../domain/types';
import { financeView, OPEX_CATEGORIES } from '../../sim/selectors';
import { localeOf } from '../i18n';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';
import { useName } from './people';

/** Validated categorical palette (dataviz validator: all checks pass on light surface). */
const STREAM_COLOR: Record<RevenueStream, string> = {
  room_care: '#138a78',
  therapy: '#d9822b',
  activity: '#4f63c9',
  special: '#b24f8f',
  homecare: '#2f6aa5',
  workforce: '#6a7d2a',
};
const REVENUE = '#138a78';
const EXPENSE = '#d9822b';

function useCompact() {
  const lang = useGame((s) => s.lang);
  return (satang: number) => '฿' + new Intl.NumberFormat(localeOf(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(satang / 100);
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function Kpi({ label, value, delta, tone }: { label: string; value: string; delta?: string | null; tone: 'rev' | 'exp' | 'net' | 'plain' }) {
  const bg = { rev: 'bg-[#e7f4f1]', exp: 'bg-[#fbeee6]', net: 'bg-[#e9edfa]', plain: 'bg-white' }[tone];
  const fg = { rev: 'text-[#0e6c5e]', exp: 'text-[#a85d17]', net: 'text-[#3a4ca8]', plain: 'text-ink' }[tone];
  return (
    <div className={`rounded-xl border border-line px-3 py-2.5 min-w-0 ${bg}`}>
      <div className="text-[11px] text-ink-soft">{label}</div>
      <div className={`text-xl font-bold tabular leading-tight truncate ${fg}`}>{value}</div>
      {delta && <div className="text-[11px] text-ink-soft tabular">{delta}</div>}
    </div>
  );
}

function BarChart({ series, labelKey }: { series: { label: number; revenue: number; opex: number }[]; labelKey: string }) {
  const t = useT();
  const money = useMoney();
  const compact = useCompact();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 210;
  const pad = { l: 52, r: 8, t: 10, b: 24 };
  const max = niceMax(Math.max(1, ...series.map((p) => Math.max(p.revenue, p.opex))));
  const n = Math.max(series.length, 1);
  const slot = (W - pad.l - pad.r) / n;
  const bw = Math.max(2, Math.min(18, slot * 0.36));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.ceil(n / 10);
  const hp = hover !== null ? series[hover] : null;
  const bar = (x: number, v: number, color: string) => {
    const top = y(v);
    const h = H - pad.b - top;
    if (h <= 0) return null;
    const r = Math.min(4, bw / 2, h);
    // Rounded data-end, square at the baseline.
    return <path d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pad.b} Z`} fill={color} />;
  };
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('fin.chart_daily')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--color-ink-soft)">
              {compact(v)}
            </text>
          </g>
        ))}
        {series.map((p, i) => {
          const x0 = pad.l + i * slot + (slot - bw * 2 - 2) / 2;
          return (
            <g key={p.label} opacity={hover === null || hover === i ? 1 : 0.45}>
              {bar(x0, p.revenue, REVENUE)}
              {bar(x0 + bw + 2, p.opex, EXPENSE)}
              {i % every === 0 && (
                <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-ink-soft)">
                  {p.label}
                </text>
              )}
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg bg-ink text-white text-[11px] px-2 py-1.5 shadow-lg tabular"
          style={{ left: `min(calc(${((pad.l + (hover! + 0.5) * slot) / W) * 100}% + 8px), calc(100% - 150px))` }}
        >
          <div className="font-semibold mb-0.5">{t(labelKey, { d: hp.label, m: hp.label })}</div>
          <div>
            <span className="inline-block size-2 rounded-sm mr-1" style={{ background: REVENUE }} />
            {t('fin.series.revenue')} {money(hp.revenue)}
          </div>
          <div>
            <span className="inline-block size-2 rounded-sm mr-1" style={{ background: EXPENSE }} />
            {t('fin.series.expense')} {money(hp.opex)}
          </div>
        </div>
      )}
    </div>
  );
}

function Donut({ mix }: { mix: { stream: RevenueStream; amount: number }[] }) {
  const t = useT();
  const money = useMoney();
  const total = mix.reduce((a, m) => a + m.amount, 0);
  if (!total) return <p className="text-xs text-ink-soft py-6">{t('fin.mix_empty')}</p>;
  const R = 52;
  const r = 32;
  let a0 = -Math.PI / 2;
  const gap = 0.025;
  const arcs = mix
    .filter((m) => m.amount > 0)
    .map((m) => {
      const frac = m.amount / total;
      const a1 = a0 + frac * Math.PI * 2;
      const s = a0 + (frac < 1 ? gap : 0);
      const e = a1 - (frac < 1 ? gap : 0);
      a0 = a1;
      const large = e - s > Math.PI ? 1 : 0;
      const p = (rad: number, ang: number) => `${60 + rad * Math.cos(ang)},${60 + rad * Math.sin(ang)}`;
      const d = frac >= 0.999 ? `M60,8 A52,52 0 1,1 59.99,8 Z M60,28 A32,32 0 1,0 60.01,28 Z` : `M${p(R, s)} A${R},${R} 0 ${large},1 ${p(R, e)} L${p(r, e)} A${r},${r} 0 ${large},0 ${p(r, s)} Z`;
      return { ...m, d, frac };
    });
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 120 120" className="size-32 shrink-0" role="img" aria-label={t('fin.mix')}>
        {arcs.map((a) => (
          <path key={a.stream} d={a.d} fill={STREAM_COLOR[a.stream]} fillRule="evenodd" />
        ))}
      </svg>
      <ul className="flex flex-col gap-1.5 text-xs w-full">
        {mix.map((m) => (
          <li key={m.stream} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm shrink-0" style={{ background: STREAM_COLOR[m.stream] }} />
            <span className="flex-1 truncate">{t(`stream.${m.stream}`)}</span>
            <span className="tabular font-semibold">{Math.round((m.amount / total) * 100)}%</span>
            <span className="tabular text-ink-soft w-20 text-right">{money(m.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FinanceView() {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const name = useName();
  const [period, setPeriod] = useState<'month' | 'all'>('month');
  const v = useMemo(() => financeView(game, period), [game, period]);
  const delta = (cur: number, prev: number | undefined) => {
    if (prev === undefined || prev === 0) return null;
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    return t('fin.vs_prev', { pct: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` });
  };
  const maxCat = Math.max(1, ...OPEX_CATEGORIES.map((c) => v.current.byCategory[c] ?? 0));

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-base mr-auto">
          {t('fin.title')} <span className="font-normal text-ink-soft text-sm">· {t('fin.month_n', { m: v.month })}</span>
        </h2>
        <div className="flex rounded-lg bg-sand p-0.5 text-sm" role="tablist">
          {(['month', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md ${period === p ? 'bg-white shadow-sm font-semibold' : 'text-ink-soft'}`}
            >
              {t(`fin.period.${p}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Kpi tone="rev" label={t('fin.revenue')} value={money(v.current.revenue)} delta={delta(v.current.revenue, v.previous?.revenue)} />
        <Kpi tone="exp" label={t('fin.expense')} value={money(v.current.opex)} delta={delta(v.current.opex, v.previous?.opex)} />
        <Kpi tone="net" label={t('fin.net')} value={money(v.current.net)} delta={delta(v.current.net, v.previous?.net)} />
        <Kpi tone="plain" label={t('fin.receivable')} value={money(v.receivables)} />
        <Kpi tone="plain" label={t('fin.capex')} value={money(v.current.capex)} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-2xl bg-white border border-line p-3 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className="font-semibold text-sm mr-auto">{period === 'month' ? t('fin.chart_daily') : t('fin.chart_monthly')}</h3>
            <span className="flex items-center gap-1 text-[11px] text-ink-soft">
              <span className="size-2.5 rounded-sm" style={{ background: REVENUE }} />
              {t('fin.series.revenue')}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-ink-soft">
              <span className="size-2.5 rounded-sm" style={{ background: EXPENSE }} />
              {t('fin.series.expense')}
            </span>
          </div>
          <BarChart series={v.series} labelKey={period === 'month' ? 'fin.day_n' : 'fin.month_n'} />
          <details className="mt-1">
            <summary className="text-[11px] text-ink-soft cursor-pointer">{t('fin.table')}</summary>
            <div className="max-h-40 overflow-auto mt-1">
              <table className="w-full text-[11px] tabular">
                <tbody>
                  {v.series.map((p) => (
                    <tr key={p.label} className="border-t border-line">
                      <td className="py-0.5">{t(period === 'month' ? 'fin.day_n' : 'fin.month_n', { d: p.label, m: p.label })}</td>
                      <td className="text-right">{money(p.revenue)}</td>
                      <td className="text-right">{money(p.opex)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="rounded-2xl bg-white border border-line p-3 min-w-0">
          <h3 className="font-semibold text-sm mb-2">{t('fin.mix')}</h3>
          <Donut mix={v.mix} />
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <section className="rounded-2xl bg-white border border-line p-3 min-w-0">
          <h3 className="font-semibold text-sm mb-2">{t('fin.expenses')}</h3>
          <ul className="flex flex-col gap-2">
            {OPEX_CATEGORIES.map((c: LedgerCategory) => {
              const val = v.current.byCategory[c] ?? 0;
              return (
                <li key={c} className="text-xs">
                  <div className="flex justify-between mb-0.5">
                    <span>{t(`cat.${c}`)}</span>
                    <span className="tabular font-semibold">{money(val)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-sand overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(val / maxCat) * 100}%`, background: EXPENSE }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl bg-white border border-line p-3 min-w-0">
          <h3 className="font-semibold text-sm mb-2">{t('fin.price')}</h3>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
            {PRICE_LEVELS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={game.priceLevel === p}
                onClick={() => dispatch({ type: 'setPriceLevel', level: p })}
                className={`rounded-lg border px-2 py-1.5 text-left ${game.priceLevel === p ? 'border-teal bg-teal text-white' : 'border-line hover:border-teal/50'}`}
              >
                <div className="text-sm font-semibold">{t(`fin.price.${p}`)}</div>
                <div className={`text-[10px] leading-snug ${game.priceLevel === p ? 'text-white/80' : 'text-ink-soft'}`}>{t(`fin.price.desc.${p}`)}</div>
              </button>
            ))}
          </div>
          <table className="w-full text-xs mt-2 tabular">
            <tbody>
              {[1, 2, 3, 4].map((lvl) => (
                <tr key={lvl} className="border-t border-line">
                  <td className="py-1 text-ink-soft">{t('fin.fee_level', { n: lvl })}</td>
                  <td className="py-1 text-right font-semibold">
                    {money(monthlyFee(lvl, game.priceLevel))}
                    <span className="font-normal text-ink-soft">{t('fin.per_month')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-ink-soft mt-1">{t('fin.price_note')}</p>
        </section>

        <section className="rounded-2xl bg-white border border-line p-3 min-w-0">
          <h3 className="font-semibold text-sm mb-2">{t('fin.invoices')}</h3>
          {v.invoices.length === 0 ? (
            <p className="text-xs text-ink-soft">{t('fin.inv_none')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {v.invoices.map((inv) => (
                <li key={inv.id} className="text-xs flex items-start gap-2 border-t border-line pt-1.5 first:border-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {name(inv.clientName, true)} · {t('fin.month_n', { m: inv.month })}
                    </div>
                    <div className="text-[10px] text-ink-soft truncate">{inv.lines.map((l) => t(l.memo, l.memoParams)).join(' + ')}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="tabular font-semibold">{money(inv.totalSatang)}</div>
                    <span className={`text-[10px] px-1.5 rounded-full ${inv.status === 'paid' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'}`}>
                      {inv.status === 'paid' ? t('fin.paid') : t('fin.issued', { day: inv.payDay })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-[10px] text-ink-soft/80">{t('disclaimer')}</p>
    </div>
  );
}
