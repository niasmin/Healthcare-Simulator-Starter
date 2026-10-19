import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cell } from '../../domain/types';
import { useIsMobile, useSummary, useT } from '../hooks';
import { useGame } from '../store';
import { currentStep, STEPS, stepKey, stepTargets, tutorialCtx, type TutorialStep } from '../tutorial';

export interface TutorialView {
  index: number;
  step: TutorialStep;
  key: string;
  targets: string[];
  hint: Cell[] | null;
}

/** The current tutorial step, derived from game + UI state (null when finished or switched off). */
export function useTutorial(): TutorialView | null {
  const game = useGame((s) => s.game);
  const tool = useGame((s) => s.tool);
  const selectedRoomId = useGame((s) => s.selectedRoomId);
  const tutorial = useGame((s) => s.tutorial);
  const started = useGame((s) => s.started);
  const summary = useSummary();
  return useMemo(() => {
    if (tutorial.off || !started) return null;
    const ctx = tutorialCtx(game, { tool, selectedRoomId, ack: new Set(tutorial.ack) }, summary);
    const index = currentStep(ctx);
    if (index < 0) return null;
    const step = STEPS[index];
    return { index, step, key: stepKey(step, ctx), targets: stepTargets(step, ctx), hint: step.hint?.(ctx) ?? null };
  }, [game, tool, selectedRoomId, tutorial, started, summary]);
}

type Box = { left: number; top: number; width: number; height: number };

/** Find the first on-screen element for any of the target ids. */
function findTarget(targets: string[]): HTMLElement | null {
  for (const id of targets) {
    if (id === 'map') continue;
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) return el;
    }
  }
  return null;
}

/** Screen box of the first visible target element, polled while the step is shown. */
function useTargetBox(targets: string[], stepKey: string): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  const scrolled = useRef<string>('');
  const sig = targets.join('|');
  useEffect(() => {
    const ids = sig ? sig.split('|') : [];
    const tick = () => {
      const el = findTarget(ids);
      if (el) {
        const tag = `${stepKey}:${el.dataset.tour}`;
        if (scrolled.current !== tag) {
          scrolled.current = tag;
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
      const r = el?.getBoundingClientRect();
      setBox((prev) => {
        if (!r) return prev === null ? prev : null;
        const next = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
        return prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };
    tick();
    const iv = window.setInterval(tick, 200);
    return () => window.clearInterval(iv);
  }, [sig, stepKey]);
  return box;
}

/** Pulsing ring around the element the player should use next. Never blocks clicks. */
function Spotlight({ box }: { box: Box | null }) {
  if (!box) return null;
  const pad = 4;
  return (
    <div
      aria-hidden
      data-testid="tour-ring"
      className="fixed z-[38] pointer-events-none rounded-xl border-[3px] border-coral tour-ring"
      style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
    />
  );
}

const overlaps = (b: Box, top: number, bottom: number, left = -Infinity, right = Infinity) =>
  b.top < bottom && b.top + b.height > top && b.left < right && b.left + b.width > left;

/** Card height budget used to keep the card off the element it points at. */
const CARD_H = 230;

/** Step-by-step coach card for the Chapter-1 tutorial. */
export function Coach() {
  const t = useT();
  const tut = useTutorial();
  const mobile = useIsMobile();
  const sheet = useGame((s) => s.sheet);
  const speed = useGame((s) => s.game.speed);
  const ack = useGame((s) => s.ackTutorial);
  const setOff = useGame((s) => s.setTutorialOff);
  const [mini, setMini] = useState(false);
  // Phones: while a bottom sheet is open the card shrinks to one line so it never hides the sheet.
  const [peek, setPeek] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const stepId = tut?.step.id;
  const box = useTargetBox(tut?.targets ?? [], tut?.key ?? '');

  // Expand again whenever the step changes.
  useEffect(() => setMini(false), [stepId]);
  useEffect(() => setPeek(false), [stepId, sheet]);
  // "Press play" is satisfied once time has run, even if the player pauses later.
  useEffect(() => {
    if (stepId === 'play' && speed > 0) ack('play');
  }, [stepId, speed, ack]);

  // Sit on the side of the screen away from the highlighted element.
  let atTop: boolean;
  if (mobile) {
    const h = window.innerHeight;
    atTop = !!sheet;
    if (box && (atTop ? overlaps(box, 0, CARD_H) : overlaps(box, h - 68 - CARD_H, h))) atTop = !atTop;
  } else {
    atTop = true;
    const col = anchor.current?.parentElement?.getBoundingClientRect();
    if (box && col && overlaps(box, col.top + 48, col.top + 56 + CARD_H, col.left, col.left + 420)) atTop = false;
  }
  const side = mobile
    ? atTop
      ? 'fixed z-[37] top-2'
      : 'fixed z-[37] bottom-[calc(env(safe-area-inset-bottom,0px)+4.25rem)]'
    : atTop
      ? 'absolute z-20 top-14'
      : 'absolute z-20 bottom-3';

  if (!tut) return <span ref={anchor} className="hidden" />;
  const total = STEPS.length;
  const n = tut.index + 1;
  const isLast = tut.step.id === 'finish';
  const pos = `${side} ${mobile ? 'inset-x-2' : 'left-3 w-[min(400px,calc(100%-6rem))]'}`;

  const compact = mobile && !!sheet && !tut.step.info && !peek;
  if (mini || compact)
    return (
      <>
        <span ref={anchor} className="hidden" />
        <Spotlight box={box} />
        <button
          type="button"
          onClick={() => (mini ? setMini(false) : setPeek(true))}
          data-testid="coach-pill"
          className={`${side} ${mobile ? 'left-2 max-w-[calc(100%-1rem)] truncate' : 'left-3'} rounded-full bg-ink text-white text-xs font-semibold px-3 py-2 shadow-lg text-left`}
        >
          🎓 {t('tut.label', { n, total })} · {t(`${tut.key}.title`, tut.step.params)}
        </button>
      </>
    );

  return (
    <>
      <span ref={anchor} className="hidden" />
      <Spotlight box={box} />
      <section className={`${pos} rounded-2xl bg-white border border-line shadow-2xl p-3 flex flex-col gap-2`} aria-live="polite" aria-label={t('tut.aria')} data-testid="coach">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-teal tabular">🎓 {t('tut.label', { n, total })}</span>
          <div className="flex-1 h-1.5 rounded-full bg-sand overflow-hidden">
            <div className="h-full bg-teal transition-all" style={{ width: `${(n / total) * 100}%` }} />
          </div>
          <button type="button" onClick={() => setMini(true)} className="text-ink-soft hover:text-ink text-sm px-1" aria-label={t('tut.minimize')} title={t('tut.minimize')}>
            ▁
          </button>
        </div>
        <h2 className="font-bold text-base leading-snug">{t(`${tut.key}.title`, tut.step.params)}</h2>
        <p className="text-sm text-ink-soft leading-relaxed">{t(`${tut.key}.body`, tut.step.params)}</p>
        <div className="flex items-center gap-2 pt-0.5">
          <button type="button" onClick={() => setOff(true)} className="text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
            {t('tut.skip')}
          </button>
          {tut.step.info && (
            <button
              type="button"
              autoFocus
              onClick={() => {
                ack(tut.step.id);
                if (isLast) setOff(true);
              }}
              className="ml-auto px-4 py-1.5 rounded-lg bg-coral text-white text-sm font-semibold hover:brightness-110"
            >
              {t(tut.index === 0 ? 'tut.start' : isLast ? 'tut.done' : 'tut.next')}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
