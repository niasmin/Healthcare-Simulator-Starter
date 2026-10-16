import { CORRIDOR_COST_PER_TILE, REFUND_PERCENT, ROOMS, ROOM_TYPES } from '../../data/rooms';
import type { RoomType } from '../../domain/types';
import { useMoney, useT } from '../hooks';
import { useGame, type Tool } from '../store';

const SWATCH: Record<RoomType, string> = {
  ward: '#4f8a80',
  nursing_station: '#4a6aa5',
  therapy: '#6b8f4e',
  staff_room: '#a77b4f',
};

function sameTool(a: Tool, b: Tool) {
  return a.kind === b.kind && (a.kind !== 'room' || (b.kind === 'room' && a.roomType === b.roomType));
}

export function BuildPanel() {
  const t = useT();
  const money = useMoney();
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);

  const item = (target: Tool, title: string, sub: string, swatch?: string) => {
    const active = sameTool(tool, target);
    return (
      <button
        key={title}
        type="button"
        onClick={() => setTool(target)}
        aria-pressed={active}
        className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
          active ? 'border-teal bg-teal text-white shadow-sm' : 'border-line bg-white hover:border-teal/50'
        }`}
      >
        <div className="flex items-center gap-2">
          {swatch && <span className="inline-block size-3 rounded-sm shrink-0" style={{ background: swatch }} />}
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <div className={`text-xs mt-0.5 ${active ? 'text-white/80' : 'text-ink-soft'}`}>{sub}</div>
      </button>
    );
  };

  return (
    <aside className="panel flex flex-col min-h-0 overflow-hidden">
      <div className="flex border-b border-line text-xs whitespace-nowrap">
        <div className="flex-1 px-2 py-2.5 font-semibold border-b-2 border-teal text-teal text-center">{t('tab.build')}</div>
        <div className="flex-1 px-2 py-2.5 text-ink-soft/60 cursor-not-allowed text-center" title={t('tab.locked')}>
          {t('tab.hire')} 🔒
        </div>
        <div className="flex-1 px-2 py-2.5 text-ink-soft/60 cursor-not-allowed text-center" title={t('tab.locked')}>
          {t('tab.admit')} 🔒
        </div>
      </div>
      <div className="flex flex-col gap-2 p-3 overflow-y-auto scroll-thin">
        {item({ kind: 'select' }, `🖐 ${t('tool.select')}`, t('tool.select.hint'))}
        {item({ kind: 'corridor' }, t('tool.corridor'), `${money(CORRIDOR_COST_PER_TILE)}${t('tool.per_tile')}`, '#d8cdb6')}
        {item({ kind: 'bulldoze' }, `⛏ ${t('tool.bulldoze')}`, t('tool.bulldoze.hint', { pct: REFUND_PERCENT }))}
        <div className="h-px bg-line my-1" />
        {ROOM_TYPES.map((rt) => {
          const d = ROOMS[rt];
          return item(
            { kind: 'room', roomType: rt },
            t(`room.${rt}`),
            `${t(`room.${rt}.desc`)} · ${money(d.baseCostSatang)} ${t('tool.base')} + ${money(d.costPerTileSatang)}${t('tool.per_tile')}`,
            SWATCH[rt],
          );
        })}
        <div className="text-[11px] text-ink-soft/70 mt-2 leading-snug">{t('tab.locked')}: {t('tab.hire')}, {t('tab.admit')}</div>
      </div>
    </aside>
  );
}
