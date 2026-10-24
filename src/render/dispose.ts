import type { Container } from 'pixi.js';

/**
 * Destroy a display object and everything under it, including each Graphics' own geometry.
 *
 * Pixi v8 gotcha: `destroy({ children: true })` does NOT free a Graphics' owned GraphicsContext
 * (its geometry and GPU buffers); only `destroy()` with no options or `{ context: true }` does.
 * The map is redrawn on every build, so that leaked ~0.5 MB per redraw and phones closed the tab
 * after a burst of building. Textures stay alive (they are shared sprite sheets).
 */
export function dispose(o: Container | null | undefined): void {
  o?.destroy({ children: true, context: true });
}
