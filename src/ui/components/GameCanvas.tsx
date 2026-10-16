import { useEffect, useMemo, useRef, useState } from 'react';
import { rectCells, rectContains, rectFromCorners } from '../../domain/grid';
import { validateCorridor, validateRoomPlacement, type PlacementCheck } from '../../domain/rules/placement';
import type { Cell, Rect } from '../../domain/types';
import { IsoRenderer } from '../../render/IsoRenderer';
import { useMoney, useSummary, useT } from '../hooks';
import { useGame } from '../store';

/**
 * Glue between the React/Zustand UI and the Pixi renderer.
 * Pointer input becomes sim Commands; previews use the same pure validators as the engine.
 */
export function GameCanvas() {
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
      },
      onDragStart: (cell) => useGame.getState().setDrag({ start: cell, end: cell }),
      onDragMove: (cell) => {
        const st = useGame.getState();
        if (st.drag && (st.drag.end.x !== cell.x || st.drag.end.y !== cell.y)) st.setDrag({ start: st.drag.start, end: cell });
      },
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

  // Live placement preview using the engine's own validators.
  const preview = useMemo((): { rect: Rect; check: PlacementCheck; cells: Cell[] } | null => {
    if (!drag) return null;
    const rect = rectFromCorners(drag.start, drag.end);
    if (tool.kind === 'room') return { rect, check: validateRoomPlacement(game, tool.roomType, rect), cells: rectCells(rect) };
    if (tool.kind === 'corridor') return { rect, check: validateCorridor(game, rect), cells: rectCells(rect) };
    return null;
  }, [drag, tool, game]);

  useEffect(() => {
    rendererRef.current?.update({
      game,
      statuses: summary.statuses,
      labelFor: (room) => t(`room.${room.type}`),
      entranceLabel: t('room.entrance'),
      selectedRoomId,
      hover,
      preview: preview ? { cells: preview.cells, valid: preview.check.ok } : null,
      hoverTint: tool.kind === 'bulldoze' ? 'danger' : 'neutral',
      leftDragPans: tool.kind === 'select',
    });
  }, [game, summary, selectedRoomId, hover, preview, tool, t, ready, lang]);

  let status: { text: string; tone: 'ok' | 'bad' | 'muted' } = { text: t('canvas.help'), tone: 'muted' };
  if (preview) {
    const name = tool.kind === 'room' ? t(`room.${tool.roomType}`) : t('room.corridor');
    const head = `${name} ${preview.rect.w}×${preview.rect.h} · ${money(preview.check.costSatang)}`;
    status = preview.check.ok
      ? { text: `${head} · ✓ ${t('preview.ok')}`, tone: 'ok' }
      : { text: `${head} · ✗ ${t(`reason.${preview.check.reason}`, preview.check.params)}`, tone: 'bad' };
  }

  const r = rendererRef.current;
  return (
    <section className="panel relative min-h-[360px] overflow-hidden" aria-label="site map">
      <div ref={hostRef} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-ink-soft">{t('canvas.loading')}</div>}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
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
      </div>
      <div
        className={`absolute left-3 bottom-3 right-3 sm:right-auto px-3 py-1.5 rounded-lg text-xs sm:text-sm shadow-sm tabular ${
          status.tone === 'ok' ? 'bg-ok text-white' : status.tone === 'bad' ? 'bg-bad text-white' : 'bg-white/90 text-ink-soft border border-line'
        }`}
      >
        {status.text}
      </div>
    </section>
  );
}
