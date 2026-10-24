import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container, Graphics } from 'pixi.js';
import { dispose } from '../render/dispose';

/**
 * Regression: players' phones closed the game after rapid building. Every build redraws the map,
 * and Pixi v8's destroy({ children: true }) keeps each Graphics' geometry alive, ~0.5 MB a redraw.
 */
describe('render memory', () => {
  it('dispose frees the geometry of every Graphics in a tree', () => {
    const root = new Container();
    const a = new Graphics().rect(0, 0, 10, 10).fill(0xff0000);
    const inner = new Container();
    const b = new Graphics().circle(0, 0, 5).fill(0x00ff00);
    inner.addChild(b);
    root.addChild(a, inner);
    const ctxA = a.context;
    const ctxB = b.context;
    const spyA = vi.spyOn(ctxA, 'destroy');
    const spyB = vi.spyOn(ctxB, 'destroy');
    dispose(root);
    expect(spyA).toHaveBeenCalled();
    expect(spyB).toHaveBeenCalled();
    expect(root.destroyed).toBe(true);
  });

  it('the renderer never destroys trees with { children: true } alone', () => {
    const dir = join(__dirname, '..', 'render');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && n !== 'dispose.ts')) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/destroy\(\{\s*children:\s*true\s*\}\)/);
    }
  });
});
