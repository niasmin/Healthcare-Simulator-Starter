import { useEffect, useMemo, useRef, useState } from 'react';
import { allRoomStatuses } from '../../domain/rules/rooms';
import type { GameState } from '../../domain/types';
import { IsoRenderer } from '../../render/IsoRenderer';
import { useT } from '../hooks';
import { mapMarkers } from './GameCanvas';

/** A read-only map of another home (a rival look-alike or a player's published layout). */
export function VisitCanvas({ state }: { state: GameState }) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<IsoRenderer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const noop = () => undefined;
    const r = new IsoRenderer({ onHover: noop, onClick: noop, onDragStart: noop, onDragMove: noop, onDragEnd: noop, onDragCancel: noop });
    rendererRef.current = r;
    let alive = true;
    r.init(host).then(() => alive && setReady(true));
    return () => {
      alive = false;
      r.destroy();
      rendererRef.current = null;
    };
  }, []);

  const people = useMemo(() => mapMarkers(state), [state]);

  useEffect(() => {
    if (!ready) return;
    const r = rendererRef.current;
    if (!r) return;
    r.update({
      people,
      game: state,
      statuses: allRoomStatuses(state.site),
      labelFor: (room) => room.name || t(`room.${room.type}`),
      entranceLabel: t('room.entrance'),
      selectedRoomId: null,
      hover: null,
      preview: null,
      hoverTint: 'neutral',
      leftDragPans: true,
      sale: null,
      showLabels: true,
    });
    r.recenter();
  }, [ready, state, people, t]);

  return <div ref={hostRef} className="absolute inset-0" data-testid="visit-canvas" />;
}
