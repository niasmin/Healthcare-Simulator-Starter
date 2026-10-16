import { nextInt, nextRandom } from '../sim/rng';
import { createInitialState } from '../sim/state';
import { advance, step } from '../sim/engine';
import { START_MINUTE, TICKS_PER_DAY } from '../sim/constants';
import { dayOf, formatClock, schedule } from '../sim/systems/time';

describe('seeded PRNG', () => {
  it('produces the same sequence for the same seed', () => {
    const seq = (seed: number) => {
      let s = seed;
      const out: number[] = [];
      for (let i = 0; i < 20; i++) {
        const r = nextRandom(s);
        out.push(r.value);
        s = r.state;
      }
      return out;
    };
    expect(seq(42)).toEqual(seq(42));
    expect(seq(42)).not.toEqual(seq(43));
    for (const v of seq(7)) expect(v >= 0 && v < 1).toBe(true);
  });

  it('nextInt stays in inclusive range', () => {
    let s = 1;
    for (let i = 0; i < 500; i++) {
      const r = nextInt(s, 3, 6);
      expect(r.value).toBeGreaterThanOrEqual(3);
      expect(r.value).toBeLessThanOrEqual(6);
      s = r.state;
    }
  });
});

describe('time system', () => {
  it('starts at day 1 07:00 and advances 10 minutes per tick', () => {
    const s0 = createInitialState(1);
    expect(s0.minute).toBe(START_MINUTE);
    expect(dayOf(s0.minute)).toBe(1);
    expect(formatClock(s0.minute)).toBe('07:00');
    const s1 = step(s0);
    expect(s1.minute - s0.minute).toBe(10);
    expect(formatClock(s1.minute)).toBe('07:10');
  });

  it('a day is 144 ticks', () => {
    expect(TICKS_PER_DAY).toBe(144);
    const s = advance(createInitialState(1), TICKS_PER_DAY);
    expect(dayOf(s.minute)).toBe(2);
    expect(formatClock(s.minute)).toBe('07:00');
  });

  it('keeps exactly one day_end event queued and reschedules it every midnight', () => {
    let s = createInitialState(1);
    for (let d = 0; d < 5; d++) {
      s = advance(s, TICKS_PER_DAY);
      expect(s.queue.filter((e) => e.kind === 'day_end')).toHaveLength(1);
      const de = s.queue.find((e) => e.kind === 'day_end')!;
      expect(de.at % 1440).toBe(0);
      expect(de.at).toBeGreaterThan(s.minute);
      expect(s.queue.filter((e) => e.kind === 'event_check')).toHaveLength(1);
    }
  });

  it('event queue orders by time then insertion sequence', () => {
    let s = createInitialState(1);
    s = schedule(s, 2000, 'day_end');
    s = schedule(s, 1500, 'day_end');
    s = schedule(s, 1500, 'day_end');
    const ats = s.queue.map((e) => [e.at, e.seq]);
    const sorted = [...ats].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(ats).toEqual(sorted);
  });
});
