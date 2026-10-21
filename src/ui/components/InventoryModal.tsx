import { useEffect, useMemo, useState } from 'react';
import { STOCK, STOCK_ITEMS } from '../../data/inventory';
import type { GameState, StockCounts, StockItem, StockMonth } from '../../domain/types';
import { daysLeft, incoming, onHand, orderCost, stockLevels, stockValue } from '../../sim/systems/inventory';
import { dayOf, formatClock } from '../../sim/systems/time';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';

type Tab = 'stock' | 'count';

/** Supply room: stock on hand, orders, reorder levels, and the month-end count. */
export function InventoryModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [tab, setTab] = useState<Tab>('stock');
  const inv = game.inventory;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const value = useMemo(() => (inv ? stockValue(Object.fromEntries(STOCK_ITEMS.map((i) => [i, onHand(inv, i)]))) : 0), [inv]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('stock.title')} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-testid="inventory">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">📦 {t('stock.title')}</h2>
          {inv?.on && <span className="rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-bold tabular">{t('stock.value', { v: money(value) })}</span>}
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        {!inv?.on ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed">{t('stock.off_intro')}</p>
            <button type="button" onClick={() => dispatch({ type: 'setInventory', on: true })} className="rounded-xl bg-teal text-white font-bold px-3 py-2.5">
              {t(inv ? 'stock.reopen' : 'stock.open')}
            </button>
            <p className="text-[11px] text-ink-soft">{t('stock.note')}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-soft leading-relaxed">{t('stock.intro')}</p>
            <label className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={inv.auto} onChange={(e) => dispatch({ type: 'setStockAuto', on: e.target.checked })} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">🤖 {t('stock.auto')}</span>
                <span className="block text-[11px] text-ink-soft">{t('stock.auto_hint')}</span>
              </span>
            </label>
            <div className="flex gap-1 rounded-xl bg-sand p-1" role="tablist">
              {(['stock', 'count'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-semibold ${tab === id ? 'bg-white shadow text-ink' : 'text-ink-soft'}`}
                >
                  {t(`stock.tab.${id}`)}
                </button>
              ))}
            </div>
            {tab === 'stock' ? <StockList game={game} /> : <MonthCount game={game} />}
            <p className="text-[11px] text-ink-soft">{t('stock.note')}</p>
            <button type="button" onClick={() => dispatch({ type: 'setInventory', on: false })} className="self-start text-[11px] text-ink-soft underline">
              {t('stock.turn_off')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Items below their reorder point with nothing on the way (for a badge). */
export function lowStock(game: GameState): number {
  const inv = game.inventory;
  if (!inv?.on) return 0;
  return STOCK_ITEMS.filter((i) => {
    const { min } = stockLevels(game, i);
    return min > 0 && onHand(inv, i) + incoming(inv, i) < min * STOCK[i].pack;
  }).length;
}

function StockList({ game }: { game: GameState }) {
  const t = useT();
  const money = useMoney();
  const inv = game.inventory!;
  const day = dayOf(game.minute);
  const orders = [...inv.orders].sort((a, b) => a.arriveAt - b.arriveAt);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {STOCK_ITEMS.map((item) => (
          <StockRow key={item} game={game} item={item} />
        ))}
      </ul>
      {orders.length > 0 && (
        <section className="rounded-xl border border-line bg-white p-2.5">
          <h3 className="text-sm font-bold mb-1">🚚 {t('stock.orders')}</h3>
          <ul className="text-xs flex flex-col gap-0.5">
            {orders.map((o) => (
              <li key={o.id} className="flex gap-2">
                <span className="flex-1">
                  {o.express ? '⚡ ' : ''}
                  {t('stock.arrive', { item: o.item, n: o.packs, when: `${dayOf(o.arriveAt) === day ? '' : `D${dayOf(o.arriveAt)} `}${formatClock(o.arriveAt)}` })}
                </span>
                <span className="tabular text-ink-soft">{money(o.costSatang)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StockRow({ game, item }: { game: GameState; item: StockItem }) {
  const t = useT();
  const money = useMoney();
  const dispatch = useGame((s) => s.dispatch);
  const inv = game.inventory!;
  const def = STOCK[item];
  const have = onHand(inv, item);
  const coming = incoming(inv, item);
  const days = daysLeft(game, item);
  const levels = stockLevels(game, item);
  const [packs, setPacks] = useState(Math.max(1, levels.max - Math.floor((have + coming) / def.pack)));
  const firstLot = inv.lots[item]?.[0];
  const day = dayOf(game.minute);
  const low = levels.min > 0 && have + coming < levels.min * def.pack;
  const status = have === 0 && days !== null ? 'out' : low ? 'low' : null;
  const cover = days === null ? 0 : Math.min(100, (days / 10) * 100);
  const setLevels = (min: number, max: number) => dispatch({ type: 'setStockLevel', item, levels: { min: Math.max(0, min), max: Math.max(Math.max(0, min), max) } });
  return (
    <li className={`rounded-xl border bg-white p-2.5 flex flex-col gap-1.5 ${status === 'out' ? 'border-bad/60' : status === 'low' ? 'border-[#f2b631]' : 'border-line'}`} data-testid={`stock-${item}`}>
      <div className="flex items-start gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {def.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold flex items-center gap-1.5">
            {t(`stock.item.${item}`)}
            {status && <span className={`rounded-full px-1.5 text-[10px] text-white ${status === 'out' ? 'bg-bad' : 'bg-[#d9901a]'}`}>{t(`stock.${status}`)}</span>}
          </div>
          <div className="text-[11px] text-ink-soft leading-snug">{t(`stock.use.${item}`)}</div>
          <div className="text-[11px] text-ink-soft">{t('stock.pack', { n: def.pack, price: money(orderCost(game, item, 1)) })}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold tabular">{t('stock.on_hand', { n: have })}</div>
          <div className="text-[11px] text-ink-soft">{days === null ? t('stock.unused') : t('stock.days', { d: days })}</div>
          {coming > 0 && <div className="text-[11px] text-teal font-semibold">{t('stock.incoming', { n: coming })}</div>}
        </div>
      </div>
      {days !== null && (
        <div className="h-1.5 rounded-full bg-sand overflow-hidden" aria-hidden>
          <div className={`h-full ${status === 'out' ? 'bg-bad' : status === 'low' ? 'bg-[#f2b631]' : 'bg-ok'}`} style={{ width: `${cover}%` }} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-ink-soft">{t('stock.levels', { min: levels.min, max: levels.max })}</span>
        <span className={`rounded-full px-1.5 font-semibold ${levels.auto ? 'bg-teal/10 text-teal' : 'bg-[#f2b631]/20'}`}>{t(levels.auto ? 'stock.levels_auto' : 'stock.levels_set')}</span>
        <span className="flex gap-0.5">
          <MiniButton label="−" onClick={() => setLevels(levels.min - 1, levels.max - 1)} disabled={levels.min <= 0} />
          <MiniButton label="+" onClick={() => setLevels(levels.min + 1, levels.max + 1)} />
        </span>
        {!levels.auto && (
          <button type="button" className="underline text-ink-soft" onClick={() => dispatch({ type: 'setStockLevel', item, levels: null })}>
            {t('stock.levels_reset')}
          </button>
        )}
        {firstLot && <span className="text-ink-soft ml-auto">{t('stock.expires', { d: firstLot.expiresDay - day + 1 })}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center rounded-lg border border-line">
          <MiniButton label="−" onClick={() => setPacks((p) => Math.max(1, p - 1))} flat />
          <span className="w-8 text-center text-sm font-bold tabular">{packs}</span>
          <MiniButton label="+" onClick={() => setPacks((p) => Math.min(99, p + 1))} flat />
        </span>
        <button
          type="button"
          title={t('stock.regular_hint')}
          onClick={() => dispatch({ type: 'orderStock', item, packs })}
          disabled={game.organization.cashSatang < orderCost(game, item, packs)}
          className="rounded-lg bg-teal text-white text-xs font-semibold px-2.5 py-1.5 disabled:opacity-40"
        >
          {t('stock.order', { n: packs })} · {money(orderCost(game, item, packs))}
        </button>
        <button
          type="button"
          title={t('stock.express_hint')}
          onClick={() => dispatch({ type: 'orderStock', item, packs, express: true })}
          disabled={game.organization.cashSatang < orderCost(game, item, packs, true)}
          className="rounded-lg bg-[#f2b631] text-ink text-xs font-semibold px-2.5 py-1.5 disabled:opacity-40"
        >
          {t('stock.express')} · {money(orderCost(game, item, packs, true))}
        </button>
      </div>
    </li>
  );
}

function MiniButton({ label, onClick, disabled, flat }: { label: string; onClick: () => void; disabled?: boolean; flat?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`size-6 grid place-items-center text-sm font-bold disabled:opacity-30 ${flat ? '' : 'rounded-md bg-sand'}`}>
      {label}
    </button>
  );
}

/** The month-end stock count, laid out like a paper count sheet. */
function MonthCount({ game }: { game: GameState }) {
  const t = useT();
  const money = useMoney();
  const inv = game.inventory!;
  const running = { ...inv.month, closing: Object.fromEntries(STOCK_ITEMS.map((i) => [i, onHand(inv, i)])) as StockCounts };
  const months: Array<StockMonth & { closing: StockCounts; open?: boolean }> = [{ ...running, open: true }, ...[...inv.reports].reverse()];
  const [pick, setPick] = useState(0);
  const m = months[Math.min(pick, months.length - 1)];
  const n = (c: StockCounts, i: StockItem) => c[i] ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {months.map((x, i) => (
          <button key={x.month + (x.open ? 'o' : '')} type="button" onClick={() => setPick(i)} aria-pressed={pick === i} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${pick === i ? 'bg-teal text-white border-teal' : 'bg-white border-line'}`}>
            {t(x.open ? 'stock.count_running' : 'stock.count_month', { m: x.month })}
          </button>
        ))}
      </div>
      {!inv.reports.length && <p className="text-[11px] text-ink-soft">{t('stock.no_reports')}</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-[11px] tabular">
          <thead className="bg-sand/70">
            <tr>
              {['item', 'uom', 'min', 'max', 'opening', 'received', 'used', 'wasted', 'closing', 'value'].map((c) => (
                <th key={c} className={`px-1.5 py-1 font-semibold whitespace-nowrap ${c === 'item' ? 'text-left' : 'text-right'}`}>
                  {t(`stock.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STOCK_ITEMS.map((i) => {
              const lv = stockLevels(game, i);
              return (
                <tr key={i} className="border-t border-line">
                  <td className="px-1.5 py-1 whitespace-nowrap">
                    {STOCK[i].icon} {t(`stock.item.${i}`)}
                  </td>
                  <td className="px-1.5 py-1 text-right text-ink-soft">{t('stock.uom')}</td>
                  <td className="px-1.5 py-1 text-right">{lv.min * STOCK[i].pack}</td>
                  <td className="px-1.5 py-1 text-right">{lv.max * STOCK[i].pack}</td>
                  <td className="px-1.5 py-1 text-right">{n(m.opening, i)}</td>
                  <td className="px-1.5 py-1 text-right">{n(m.received, i)}</td>
                  <td className="px-1.5 py-1 text-right">{n(m.used, i)}</td>
                  <td className={`px-1.5 py-1 text-right ${n(m.wasted, i) ? 'text-bad font-semibold' : ''}`}>{n(m.wasted, i)}</td>
                  <td className="px-1.5 py-1 text-right font-semibold">{n(m.closing, i)}</td>
                  <td className="px-1.5 py-1 text-right">{money(stockValue({ [i]: n(m.closing, i) }))}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-line font-bold">
              <td className="px-1.5 py-1" colSpan={9}>
                {t('stock.spent', { v: money(m.spentSatang) })}
              </td>
              <td className="px-1.5 py-1 text-right">{money(stockValue(m.closing))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
