import { useEffect, useMemo, useRef, useState } from 'react';
import { moveCheck, movedRect } from '../../sim/systems/move';
import { routineAt } from '../../sim/systems/routine';
import { allRoomStatuses } from '../../domain/rules/rooms';
import { rectCells, rectContains, rectFromCorners } from '../../domain/grid';
import { validateCorridor, validateDecor, validateRoomPlacement, type PlacementCheck } from '../../domain/rules/placement';
import type { Cell, GameState, Rect, Resident } from '../../domain/types';
import { MEAL_TIMES } from '../../data/patients';
import { IsoRenderer, type PersonMarker } from '../../render/IsoRenderer';
import { ROLES } from '../../data/staff';
import { peopleMarkers } from '../../sim/selectors';
import { RESIDENT_SPRITE, STAFF_SPRITE } from '../../render/sprites';
import { weatherFor } from '../../render/Ambience';
import { dayOf } from '../../sim/systems/time';
import { prefabCost, prefabDef, prefabRect } from '../../data/prefabs';
import { nextPlot } from '../../data/chapters';
import type { CareGroup, StaffRole } from '../../domain/types';
import { isMobileNow, useMoney, useSummary, useT, useRoomLabel } from '../hooks';
import { useGame } from '../store';
import { useTourPointer } from './Tutorial';

export const GROUP_HEX: Record<CareGroup, number> = { active_aging: 0xc9822b, stroke_rehab: 0x4a6aa5, bedridden: 0x8a5a9e, dementia: 0xb5537a, tube_feeding: 0x3f8f86, airway: 0x2f6aa5, advanced_dementia: 0x9c3f6a, post_surgery: 0x3a8fb7 };

/** Groups who can get up and about; the rest stay in bed. */
const STROLLERS = new Set<CareGroup>(['active_aging', 'stroke_rehab', 'dementia', 'post_surgery']);
/** Strolling hours: mid-morning and the afternoon. */
const strollHour = (minute: number) => {
  const h = (minute % 1440) / 60;
  return (h >= 9 && h < 11.5) || (h >= 14.5 && h < 17.5);
};

/** Meal times when residents who get about sit in the dining room (if the home has one). */
const mealTime = (minute: number) => MEAL_TIMES.some((t) => Math.abs((minute % 1440) - t) <= 40);

/** The sim's people as map markers: colours, sprites, and residents up and about (looks only). */
export function mapMarkers(game: GameState) {
  const residents = new Map(game.residents.map((r) => [r.id, r]));
  const markers = peopleMarkers(game);
  // Nobody strolls in the rain, and a resident with a carer at the bedside stays put.
  const dining = game.site.rooms.some((r) => r.type === 'dining_room');
  const outside = (strollHour(game.minute) && weatherFor(game.seed, dayOf(game.minute)) !== 'rain') || (dining && mealTime(game.minute));
  const tended = new Set(markers.filter((m) => m.kind === 'staff' && m.bed !== undefined).map((m) => `${m.roomId}#${m.bed}`));
  const look = (r: Resident) => (r.needs.mobility < 65 ? RESIDENT_SPRITE.chair : r.name.gender === 'm' ? RESIDENT_SPRITE.m : RESIDENT_SPRITE.f);
  // The day's routine takes residents who get about to the bathroom and the therapy room.
  const statuses = allRoomStatuses(game.site);
  const openRoom = (type: string) => game.site.rooms.find((x) => x.type === type && statuses.get(x.id)?.operational)?.id;
  const bathroom = openRoom('bathroom');
  const therapy = openRoom('therapy');
  const spots = new Map<string, number>();
  const spotIn = (roomId: string) => {
    const n = spots.get(roomId) ?? 0;
    spots.set(roomId, n + 1);
    return n;
  };
  const visitors: PersonMarker[] = [];
  const out = markers.map((m) => {
    if (m.kind === 'staff') return { ...m, color: ROLES[m.role as StaffRole].color, sprite: STAFF_SPRITE[m.role as StaffRole] };
    const r = residents.get(m.key);
    const color = GROUP_HEX[m.group as CareGroup];
    // In a therapy session: standing (or in a chair) in the therapy room.
    if (r && m.bed === undefined) return { ...m, color, sprite: look(r) };
    if (!r) return { ...m, color };
    const step = routineAt(game, r);
    const busy = tended.has(`${m.roomId}#${m.bed}`);
    // Family at the bedside (they walk in from the gate).
    if (step === 'visit') visitors.push({ key: `visit-${r.id}`, kind: 'visitor', roomId: m.roomId, bed: m.bed, color: 0x7a8a99, sprite: VISITOR_SPRITES[r.id.length % VISITOR_SPRITES.length] });
    const mobile = STROLLERS.has(r.group) && r.needs.mobility >= 40 && !busy;
    if (step === 'sleep' || step === 'nap' || step === 'visit' || !mobile) return { ...m, color };
    if (step === 'bath' && bathroom) return { ...m, roomId: bathroom, bed: undefined, spot: spotIn(bathroom), color, sprite: look(r) };
    if (step === 'activity' && therapy && !(outside && r.id.length % 2)) return { ...m, roomId: therapy, bed: undefined, spot: spotIn(therapy), color, sprite: look(r) };
    if (!outside) return { ...m, color };
    return { ...m, color, stroll: true, sprite: look(r) };
  });
  return [...out, ...visitors];
}

/** Relatives who come to visit (townsfolk art). */
const VISITOR_SPRITES = ['ch_owner_f', 'ch_owner_m', 'ch_student'];

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
  const exterior = useGame((s) => s.exterior);
  const fxOn = useGame((s) => s.fxOn);
  const roomLabel = useRoomLabel();
  const summary = useSummary();
  const tourHint = useTourPointer()?.hint ?? null;

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
        } else if (tl.kind === 'move') {
          // Like a prefab: drag the ghost, lift to drop the building there.
          const res = st.dispatch({ type: 'moveRoom', roomId: tl.roomId, origin: d.end, rotated: tl.rotated });
          if (res.ok) {
            st.setTool({ kind: 'select' });
            st.select(tl.roomId);
          }
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
    if (tool.kind === 'move') {
      const at = drag?.end ?? hover;
      const room = game.site.rooms.find((r) => r.id === tool.roomId);
      if (!at || !room) return null;
      const rect = movedRect(room, at, tool.rotated);
      return { rect, check: moveCheck(game, room.id, rect), cells: rectCells(rect) };
    }
    if (!drag) return null;
    const rect = rectFromCorners(drag.start, drag.end);
    if (tool.kind === 'room') return { rect, check: validateRoomPlacement(game, tool.roomType, rect), cells: rectCells(rect) };
    if (tool.kind === 'corridor') return { rect, check: validateCorridor(game, rect), cells: rectCells(rect) };
    if (tool.kind === 'decor') return { rect: { ...drag.end, w: 1, h: 1 }, check: validateDecor(game, tool.decor, drag.end), cells: [drag.end] };
    return null;
  }, [drag, hover, tool, game]);

  const people = useMemo(() => mapMarkers(game), [game]);

  const plot = nextPlot(game.site.width);
  useEffect(() => {
    rendererRef.current?.update({
      people,
      game,
      statuses: summary.statuses,
      labelFor: (room) => (room.id ? roomLabel(room) : t(`room.${room.type}`)),
      entranceLabel: t('room.entrance'),
      selectedRoomId,
      hover,
      preview: preview ? { cells: preview.cells, valid: preview.check.ok } : null,
      hint: tourHint,
      hoverTint: tool.kind === 'bulldoze' ? 'danger' : 'neutral',
      leftDragPans: tool.kind === 'select',
      showLabels,
      exterior,
      effects: fxOn ? 'high' : 'low',
      weather: weatherFor(game.seed, dayOf(game.minute)),
      sale: plot ? { toX: plot.width, label: game.chapter.id >= plot.chapter ? t('world.sale_now', { price: money(plot.priceSatang) }) : t('world.sale_later', { c: plot.chapter }) } : null,
    });
  }, [game, people, summary, selectedRoomId, hover, preview, tool, t, ready, lang, showLabels, exterior, tourHint, roomLabel, fxOn]);

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
      tool.kind === 'room' ? t(`room.${tool.roomType}`) : tool.kind === 'decor' ? t(`decor.${tool.decor}`) : tool.kind === 'prefab' ? t(`prefab.${tool.prefab}`) : tool.kind === 'move' ? t('move.moving') : t('room.corridor');
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
          { label: '🏠', title: t(exterior ? 'canvas.interior' : 'canvas.exterior'), fn: () => useGame.getState().setExterior(!exterior), on: exterior },
          { label: '3D', title: t('view3d.open'), fn: () => useGame.getState().setView3d(true) },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            aria-label={b.title}
            aria-pressed={'on' in b ? b.on : undefined}
            onClick={b.fn}
            className={`size-9 rounded-lg border text-lg font-semibold shadow-sm ${'on' in b && b.on ? 'bg-teal text-white border-teal' : 'bg-white/90 border-line hover:bg-white'}`}
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
