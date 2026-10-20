import { useEffect, useMemo, useRef, useState } from 'react';
import { rectCells, rectContains, rectFromCorners } from '../../domain/grid';
import { validateCorridor, validateDecor, validateRoomPlacement, type PlacementCheck } from '../../domain/rules/placement';
import type { Cell, Rect } from '../../domain/types';
import { IsoRenderer } from '../../render/IsoRenderer';
import { ROLES } from '../../data/staff';
import { peopleMarkers } from '../../sim/selectors';
import { STAFF_SPRITE } from '../../render/sprites';
import { prefabCost, prefabDef, prefabRect } from '../../data/prefabs';
import { EXPANDED_WIDTH, LAND_PRICE } from '../../data/chapters';
import type { CareGroup, StaffRole } from '../../domain/types';
import { isMobileNow, useMoney, useSummary, useT } from '../hooks';
import { useGame } from '../store';

const GROUP_HEX: Record<CareGroup, number> = { active_aging: 0xc9822b, stroke_rehab: 0x4a6aa5, bedridden: 0x8a5a9e, dementia: 0xb5537a, tube_feeding: 0x3f8f86, airway: 0x2f6aa5 };

/**
 * Glue between the React/Zustand UI and the Pixi renderer.
 * Pointer input becomes sim Commands; previews use the same pure validators as the engine.
 */
export function GameCanvas({ controls = true }: { controls?: boolean } = {}) {
  const t = useT();
  const money = useMoney();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<IsoRenderer | null>(null);
  const [ready, setReady] = useState(false);

  const game = useGame((s) => s.game);
  const tool = useGame((s) => s.tool);
  const hover = useGame((s) => s.hover);
  const drag = useGame((s) => s.drag);
  const selectedRoomId = useGame((s) => s.selectedRoomId);
  const showLabels = useGame((s) => s.showLabels);
  const summary = useSummary();

  // Create the renderer once.
  useEffect(() => {
    const host = hostRef.current!;
    const r = new IsoRenderer({
      onHover: (cell) => useGame.getState().setHover(cell),
      onClick: (cell) => {
        const st = useGame.getState();
        const room = st.game.site.rooms.find((rm) => rectContains(rm.rect, cell));
        st.select(room ? room.id : null);
        if (room && isMobileNow()) st.setSheet('info');
      },
      onDragStart: (cell) => useGame.getState().setDrag({ start: cell, end: cell }),
      onDragMove: (cell) => {
        const st = useGame.getState();
        if (st.drag && (st.drag.end.x !== cell.x || st.drag.end.y !== cell.y)) st.setDrag({ start: st.drag.start, end: cell });
      },
      onDragCancel: () => useGame.getState().setDrag(null),
      onDragEnd: () => {
        const st = useGame.getState();
        const d = st.drag;
        st.setDrag(null);
        if (!d) return;
        const rect = rectFromCorners(d.start, d.end);
        const tl = st.tool;
        if (tl.kind === 'room') {
          const res = st.dispatch({ type: 'placeRoom', roomType: tl.roomType, rect });
          if (res.ok && res.id) st.select(res.id);
        } else if (tl.kind === 'corridor') {
          st.dispatch({ type: 'paintCorridor', rect });
        } else if (tl.kind === 'decor') {
          st.dispatch({ type: 'placeDecor', decor: tl.decor, cell: d.end });
        } else if (tl.kind === 'prefab') {
          // Drag the ghost around, lift to place (a tap places where you tapped).
          const res = st.dispatch({ type: 'placePrefab', prefab: tl.prefab, origin: d.end, rotated: tl.rotated });
          if (res.ok && res.id) st.select(res.id);
        } else if (tl.kind === 'bulldoze') {
          if (d.start.x === d.end.x && d.start.y === d.end.y) st.dispatch({ type: 'bulldoze', cell: d.start });
        }
      },
    });
    rendererRef.current = r;
    // Debug/test hook (?debug in the URL): lets automated browser tests map cells to pixels.
    if (import.meta.env.DEV || window.location.search.includes('debug'))
      (window as unknown as Record<string, unknown>).__HE__ = { store: useGame, renderer: r };
    r.init(host).then(() => setReady(true));
    return () => {
      r.destroy();
      rendererRef.current = null;
    };
  }, []);

  const lang = useGame((s) => s.lang);
  // The controls hint shows for the first 45 seconds, then gets out of the way (previews still show).
  const [showHelp, setShowHelp] = useState(true);
  useEffect(() => {
    const h = setTimeout(() => setShowHelp(false), 45_000);
    return () => clearTimeout(h);
  }, []);

  // Live placement preview using the engine's own validators.
  const preview = useMemo((): { rect: Rect; check: PlacementCheck; cells: Cell[] } | null => {
    if (tool.kind === 'prefab') {
      const at = drag?.end ?? hover;
      const def = prefabDef(tool.prefab);
      if (!at || !def) return null;
      const rect = prefabRect(def, at, tool.rotated);
      const room = validateRoomPlacement(game, def.roomType, rect);
      const costSatang = prefabCost(def, rect);
      const check: PlacementCheck = room.ok && game.organization.cashSatang < costSatang ? { ok: false, reason: 'insufficient_funds', costSatang } : { ...room, costSatang };
      return { rect, check, cells: rectCells(rect) };
    }
    if (!drag) return null;
    const rect = rectFromCorners(drag.start, drag.end);
    if (tool.kind === 'room') return { rect, check: validateRoomPlacement(game, tool.roomType, rect), cells: rectCells(rect) };
    if (tool.kind === 'corridor') return { rect, check: validateCorridor(game, rect), cells: rectCells(rect) };
    if (tool.kind === 'decor') return { rect: { ...drag.end, w: 1, h: 1 }, check: validateDecor(game, tool.decor, drag.end), cells: [drag.end] };
    return null;
  }, [drag, hover, tool, game]);

  const people = useMemo(
    () =>
      peopleMarkers(game).map((m) => ({
        ...m,
        color: m.kind === 'staff' ? ROLES[m.role as StaffRole].color : GROUP_HEX[m.group as CareGroup],
        ...(m.kind === 'staff' ? { sprite: STAFF_SPRITE[m.role as StaffRole] } : {}),
      })),
    [game],
  );

  useEffect(() => {
    rendererRef.current?.update({
      people,
      game,
      statuses: summary.statuses,
      labelFor: (room) => t(`room.${room.type}`),
      entranceLabel: t('room.entrance'),
      selectedRoomId,
      hover,
      preview: preview ? { cells: preview.cells, valid: preview.check.ok } : null,
      hoverTint: tool.kind === 'bulldoze' ? 'danger' : 'neutral',
      leftDragPans: tool.kind === 'select',
      showLabels,
      sale: game.site.width < EXPANDED_WIDTH ? { toX: EXPANDED_WIDTH, label: game.chapter.id >= 3 ? t('world.sale_now', { price: money(LAND_PRICE) }) : t('world.sale_later', { c: 3 }) } : null,
    });
  }, [game, people, summary, selectedRoomId, hover, preview, tool, t, ready, lang, showLabels]);

  // The phone HUD's "overview map" button recenters through this event.
  useEffect(() => {
    const onRecenter = () => rendererRef.current?.recenter();
    window.addEventListener('he:recenter', onRecenter);
    return () => window.removeEventListener('he:recenter', onRecenter);
  }, []);

  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  let status: { text: string; tone: 'ok' | 'bad' | 'muted' } | null = showHelp ? { text: t(coarse ? 'canvas.help_touch' : 'canvas.help'), tone: 'muted' } : null;
  if (preview) {
    const name =
      tool.kind === 'room' ? t(`room.${tool.roomType}`) : tool.kind === 'decor' ? t(`decor.${tool.decor}`) : tool.kind === 'prefab' ? t(`prefab.${tool.prefab}`) : t('room.corridor');
    const head = `${name} ${preview.rect.w}×${preview.rect.h} · ${money(preview.check.costSatang)}`;
    status = preview.check.ok
      ? { text: `${head} · ✓ ${t('preview.ok')}`, tone: 'ok' }
      : { text: `${head} · ✗ ${t(`reason.${preview.check.reason}`, preview.check.params)}`, tone: 'bad' };
  }

  const r = rendererRef.current;
  return (
    <section className="absolute inset-0 overflow-hidden" aria-label="site map">
      <div ref={hostRef} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-ink-soft">{t('canvas.loading')}</div>}
      {controls && <div className="absolute right-3 top-3 max-lg:top-[4.5rem] flex flex-col gap-1.5">
        {[
          { label: '+', title: t('canvas.zoom_in'), fn: () => r?.zoomBy(1.2) },
          { label: '−', title: t('canvas.zoom_out'), fn: () => r?.zoomBy(1 / 1.2) },
          { label: '⌖', title: t('canvas.reset'), fn: () => r?.recenter() },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            aria-label={b.title}
            onClick={b.fn}
            className="size-9 rounded-lg bg-white/90 border border-line text-lg font-semibold shadow-sm hover:bg-white"
          >
            {b.label}
          </button>
        ))}
      </div>}
      {status && (
        <div
          className={`absolute left-3 bottom-3 max-lg:bottom-[4.8rem] right-3 sm:right-auto px-3 py-1.5 rounded-lg text-xs sm:text-sm shadow-sm tabular ${
            status.tone === 'ok' ? 'bg-ok text-white' : status.tone === 'bad' ? 'bg-bad text-white' : 'bg-white/90 text-ink-soft border border-line'
          }`}
        >
          {status.text}
        </div>
      )}
    </section>
  );
}
