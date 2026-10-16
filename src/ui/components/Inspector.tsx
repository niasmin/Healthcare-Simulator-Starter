import { EQUIPMENT, REFUND_PERCENT, ROOMS, roomConstructionCost } from '../../data/rooms';
import { cellIndex, rectArea } from '../../domain/grid';
import { pctOf } from '../../domain/money';
import type { EquipmentId } from '../../domain/types';
import { dayOf, formatClock } from '../../sim/systems/time';
import { useMoney, useSummary, useT } from '../hooks';
import { useGame } from '../store';

function RoomInspector({ roomId }: { roomId: string }) {
  const t = useT();
  const money = useMoney();
  const room = useGame((s) => s.game.site.rooms.find((r) => r.id === roomId));
  const cash = useGame((s) => s.game.organization.cashSatang);
  const dispatch = useGame((s) => s.dispatch);
  const summary = useSummary();
  if (!room) return null;
  const def = ROOMS[room.type];
  const st = summary.statuses.get(room.id)!;
  let equipValue = 0;
  for (const [id, n] of Object.entries(room.equipment) as [EquipmentId, number][]) equipValue += EQUIPMENT[id].costSatang * n;
  const refund = pctOf(roomConstructionCost(room.type, room.rect) + equipValue, REFUND_PERCENT);
  const area = rectArea(room.rect);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-base leading-tight">{t(`room.${room.type}`)}</h3>
        <span
          className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${st.operational ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}
        >
          {st.operational ? t('inspector.operational') : t('inspector.not_operational')}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-soft">{t('inspector.size')}</dt>
        <dd className="tabular">{t('inspector.cells', { w: room.rect.w, h: room.rect.h, area })}</dd>
        {room.type === 'ward' && (
          <>
            <dt className="text-ink-soft">{t('inspector.capacity')}</dt>
            <dd className="tabular">{t('inspector.beds', { n: st.capacity })}</dd>
          </>
        )}
        <dt className="text-ink-soft">{t('inspector.upkeep')}</dt>
        <dd className="tabular">{money(def.upkeepPerTileSatang * area)}</dd>
      </dl>

      {st.issues.length > 0 && (
        <ul className="flex flex-col gap-1">
          {st.issues.map((iss, i) => (
            <li key={i} className="text-xs rounded-lg bg-bad/10 text-bad px-2 py-1.5 leading-snug">
              ⚠{' '}
              {iss.kind === 'no_access'
                ? t('issue.no_access')
                : t('issue.missing_equipment', { equipment: iss.equipment, have: iss.have, need: iss.need })}
            </li>
          ))}
        </ul>
      )}

      <div>
        <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1.5">{t('inspector.equipment')}</div>
        <ul className="flex flex-col gap-1.5">
          {def.equipment.map((slot) => {
            const have = room.equipment[slot.id] ?? 0;
            const max = slot.max(room.rect);
            const price = EQUIPMENT[slot.id].costSatang;
            return (
              <li key={slot.id} className="flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t(`equip.${slot.id}`)}</div>
                  <div className="text-[11px] text-ink-soft tabular">
                    {money(price)} · {slot.required > 0 ? t('inspector.required') : t('inspector.optional')}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="-"
                  disabled={have === 0}
                  onClick={() => dispatch({ type: 'removeEquipment', roomId: room.id, equipment: slot.id })}
                  className="size-7 rounded-md border border-line disabled:opacity-30 hover:bg-sand"
                >
                  −
                </button>
                <span className={`w-12 text-center text-sm tabular font-semibold ${have < slot.required ? 'text-bad' : ''}`}>
                  {have}/{max}
                </span>
                <button
                  type="button"
                  aria-label="+"
                  disabled={have >= max || cash < price}
                  onClick={() => dispatch({ type: 'installEquipment', roomId: room.id, equipment: slot.id })}
                  className="size-7 rounded-md bg-teal text-white disabled:opacity-30 hover:bg-teal-dark"
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => dispatch({ type: 'deleteRoom', roomId: room.id })}
        className="mt-1 w-full rounded-lg border border-bad/40 text-bad text-sm py-1.5 hover:bg-bad/10"
      >
        {t('inspector.demolish', { amount: money(refund) })}
      </button>
    </div>
  );
}

function CellInfo() {
  const t = useT();
  const hover = useGame((s) => s.hover);
  const site = useGame((s) => s.game.site);
  const tool = useGame((s) => s.tool);
  let hint = t('tool.select.hint');
  if (tool.kind === 'corridor') hint = t('tool.corridor.hint');
  if (tool.kind === 'bulldoze') hint = t('tool.bulldoze.hint', { pct: REFUND_PERCENT });
  if (tool.kind === 'room') {
    const d = ROOMS[tool.roomType];
    hint = t('tool.room.hint', { minSide: d.minSide, minArea: d.minArea, maxArea: d.maxArea });
  }
  let what = '';
  if (hover) {
    const isEntrance = hover.x === site.entrance.x && hover.y === site.entrance.y;
    const room = site.rooms.find((r) => hover.x >= r.rect.x && hover.y >= r.rect.y && hover.x < r.rect.x + r.rect.w && hover.y < r.rect.y + r.rect.h);
    what = isEntrance
      ? t('room.entrance')
      : room
        ? t(`room.${room.type}`)
        : site.corridor[cellIndex(hover.x, hover.y, site.width)]
          ? t('room.corridor')
          : t('room.empty');
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-ink-soft">{t('inspector.none')}</p>
      <p className="rounded-lg bg-sand/60 px-2.5 py-2 text-xs leading-relaxed">{hint}</p>
      {hover && (
        <p className="text-xs tabular">
          {t('inspector.cell', { x: hover.x, y: hover.y })} · <span className="font-semibold">{what}</span>
        </p>
      )}
    </div>
  );
}

function Alerts() {
  const t = useT();
  const log = useGame((s) => s.game.log);
  const summary = useSummary();
  const rooms = useGame((s) => s.game.site.rooms);
  const select = useGame((s) => s.select);
  const problems = rooms.filter((r) => !summary.statuses.get(r.id)?.operational);
  const items = [...log].reverse().slice(0, 12);
  return (
    <div className="flex flex-col gap-1.5">
      {problems.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => select(r.id)}
          className="text-left text-xs rounded-lg bg-warn/12 border border-warn/30 px-2 py-1.5 hover:bg-warn/20"
        >
          ⚠ {t(`room.${r.type}`)} — {t('inspector.not_operational')}
        </button>
      ))}
      {items.length === 0 && problems.length === 0 && <p className="text-xs text-ink-soft">{t('alerts.empty')}</p>}
      {items.map((l) => (
        <div key={l.id} className="text-xs flex gap-2">
          <span className="text-ink-soft tabular shrink-0">
            D{dayOf(l.at)} {formatClock(l.at)}
          </span>
          <span className={l.level === 'good' ? 'text-ok' : l.level === 'warn' ? 'text-warn' : ''}>{t(l.key, l.params)}</span>
        </div>
      ))}
    </div>
  );
}

export function SidePanel() {
  const t = useT();
  const selected = useGame((s) => s.selectedRoomId);
  return (
    <aside className="panel flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 border-b border-line overflow-y-auto scroll-thin max-h-[62%]">
        <h2 className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">{t('inspector.title')}</h2>
        {selected ? <RoomInspector roomId={selected} /> : <CellInfo />}
      </div>
      <div className="p-3 overflow-y-auto scroll-thin flex-1 min-h-0">
        <h2 className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">{t('alerts.title')}</h2>
        <Alerts />
      </div>
    </aside>
  );
}
