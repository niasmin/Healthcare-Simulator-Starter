import { useEffect, useMemo, useRef, useState } from 'react';
import { Scene3D } from '../../render3d/Scene3D';
import { useRoomLabel, useT } from '../hooks';
import { useGame } from '../store';
import { mapMarkers } from './GameCanvas';

/** Full-screen 3D view of the home: drag to turn it round, pinch or scroll to zoom. The game keeps running. */
export default function View3DModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene3D | null>(null);
  const [failed, setFailed] = useState(false);
  const [interior, setInterior] = useState(false);
  const [spin, setSpin] = useState(true);
  const [labels, setLabels] = useState(true);
  const game = useGame((s) => s.game);
  const roomLabel = useRoomLabel();
  const markers = useMemo(() => mapMarkers(game), [game]);
  const names = useMemo(() => new Map(labels ? game.site.rooms.map((r) => [r.id, roomLabel(r)] as const) : []), [game.site.rooms, labels, roomLabel]);

  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new Scene3D(host.current);
    } catch {
      setFailed(true); // no WebGL on this device
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.update({ game, markers, interior, labels: names, autoRotate: spin });
  }, [game, markers, interior, names, spin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const btn = (on: boolean) =>
    `rounded-xl px-3 py-1.5 text-sm font-semibold border shadow ${on ? 'bg-teal text-white border-teal' : 'bg-white/90 text-ink border-line'}`;
  return (
    <div className="fixed inset-0 z-[70] bg-[#0c1633]" role="dialog" aria-modal="true" aria-label={t('view3d.title')}>
      <div ref={host} className="absolute inset-0" onPointerDown={() => setSpin(false)} />
      {failed && <div className="absolute inset-0 grid place-items-center text-white p-6 text-center">{t('view3d.no_webgl')}</div>}
      <div className="absolute top-[max(env(safe-area-inset-top),0.75rem)] left-3 right-3 flex flex-wrap items-center gap-2">
        <h2 className="text-white font-bold text-lg drop-shadow mr-auto">🧊 {t('view3d.title')}</h2>
        <button type="button" aria-pressed={interior} onClick={() => setInterior(!interior)} className={btn(interior)}>
          {interior ? `🏠 ${t('view3d.exterior')}` : `🛏️ ${t('view3d.interior')}`}
        </button>
        <button type="button" aria-pressed={spin} onClick={() => setSpin(!spin)} className={btn(spin)}>
          🔄 {t('view3d.spin')}
        </button>
        <button type="button" aria-pressed={labels} onClick={() => setLabels(!labels)} className={btn(labels)}>
          🏷️ {t('view3d.labels')}
        </button>
        <button type="button" onClick={() => scene.current?.recenter()} className={btn(false)}>
          ⌖ {t('view3d.recenter')}
        </button>
        <button type="button" onClick={onClose} aria-label={t('view3d.close')} className="rounded-xl px-3 py-1.5 text-sm font-bold bg-coral text-white shadow">
          ✕ {t('view3d.close')}
        </button>
      </div>
      <p className="absolute bottom-[max(env(safe-area-inset-bottom),0.75rem)] left-1/2 -translate-x-1/2 rounded-2xl bg-black/45 text-white text-xs px-3 py-1 text-center w-max max-w-[calc(100%-1.5rem)]">{t('view3d.hint')}</p>
    </div>
  );
}
