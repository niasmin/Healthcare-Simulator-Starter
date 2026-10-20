import 'fake-indexeddb/auto';
import { advance, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { TICKS_PER_DAY } from '../sim/constants';
import { decodeSave, encodeSave, validate } from '../storage/format';
import { LocalStore } from '../storage/localStore';
import { CHUNK, CloudStore, type MiniDB } from '../storage/cloudStore';
import { SaveManager } from '../storage/saves';
import type { GameState } from '../domain/types';
import { admit, buildHome, hire, ok } from './helpers';

function midGame(): GameState {
  let s = buildHome(createInitialState(21));
  [s] = hire(s, 'rn', ['morning']);
  [s] = hire(s, 'rn', ['afternoon']);
  [s] = hire(s, 'caregiver', ['morning']);
  [s] = hire(s, 'caregiver', ['afternoon']);
  [s] = hire(s, 'caregiver', ['night']);
  [s] = hire(s, 'pt', ['morning']);
  for (let i = 0; i < 3; i++) {
    let id: string;
    [s, id] = admit(s);
    s = ok(s, { type: 'createCarePlan', residentId: id });
  }
  return advance(s, TICKS_PER_DAY * 12 + 37);
}

/** In-memory stand-in for the platform db, enforcing its 256 KiB document limit. */
function fakeDb(): MiniDB & { docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    docs,
    doc(path: string) {
      return {
        async get() {
          const d = docs.get(path);
          return { exists: !!d, data: () => (d ? structuredClone(d) : undefined) };
        },
        async set(data: Record<string, unknown>) {
          if (JSON.stringify(data).length > 256 * 1024) throw { code: 'invalid_argument' };
          docs.set(path, structuredClone(data));
        },
        async delete() {
          docs.delete(path);
        },
      };
    },
  };
}

describe('save format', () => {
  it('save and reload gives identical state, and the reloaded game continues identically', async () => {
    const s = midGame();
    const blob = await encodeSave(s, 'slot1', 1000);
    expect(blob.encoding).toBe('gzip-b64');
    expect(blob.payload.length).toBeLessThan(JSON.stringify(s).length / 3);
    const back = await decodeSave(blob);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state).toEqual(s);
    expect(JSON.stringify(advance(back.state, 300))).toBe(JSON.stringify(advance(s, 300)));
    expect(blob.meta).toMatchObject({ slot: 'slot1', day: 13, residents: 3, savedAt: 1000 });
  });

  it('rejects corrupt, tampered or incompatible saves without throwing', async () => {
    const s = midGame();
    const blob = await encodeSave(s, 'slot1');
    expect(await decodeSave({ ...blob, payload: 'not base64 !!' })).toEqual({ ok: false, error: 'corrupt' });
    expect(await decodeSave({ ...blob, meta: { ...blob.meta, format: 99 } })).toEqual({ ok: false, error: 'incompatible' });
    const tampered = { ...s, organization: { ...s.organization, cashSatang: s.organization.cashSatang + 1 } };
    expect(validate(tampered)).toEqual({ ok: false, error: 'corrupt' }); // cash no longer matches the ledger
    expect(validate({ ...s, schemaVersion: 2 } as unknown as GameState)).toEqual({ ok: false, error: 'incompatible' });
  });
});

describe('stores', () => {
  it('local IndexedDB store round-trips and deletes', async () => {
    const store = new LocalStore('test-saves-1');
    const blob = await encodeSave(midGame(), 'slot2');
    await store.put(blob);
    expect((await store.get('slot2'))?.payload).toBe(blob.payload);
    await store.remove('slot2');
    expect(await store.get('slot2')).toBeNull();
  });

  it('cloud store splits large saves into parts under the document limit', async () => {
    const db = fakeDb();
    const cloud = new CloudStore(db, 'u1');
    const big = { meta: (await encodeSave(midGame(), 'slot3')).meta, encoding: 'json' as const, payload: 'x'.repeat(CHUNK * 2 + 5) };
    await cloud.put(big);
    expect([...db.docs.keys()].sort()).toEqual(['data/users/u1/save-slot3', 'data/users/u1/save-slot3.p1', 'data/users/u1/save-slot3.p2']);
    expect((await cloud.get('slot3'))?.payload).toBe(big.payload);
    await cloud.remove('slot3');
    expect(db.docs.size).toBe(0);
  });
});

describe('save manager', () => {
  it('loads the newest copy across devices (cloud beats an older local save)', async () => {
    const db = fakeDb();
    const phone = new SaveManager(new LocalStore('test-phone'));
    phone.attachCloud(new CloudStore(db, 'min'));
    const pc = new SaveManager(new LocalStore('test-pc'));
    pc.attachCloud(new CloudStore(db, 'min'));

    const early = createInitialState(3);
    await pc.save(early, 'auto', 1_000);
    const later = midGame();
    await phone.save(later, 'auto', 2_000);

    const loaded = await pc.load('auto');
    expect(loaded.ok && loaded.state.minute).toBe(later.minute);
    expect((await pc.list()).find((x) => x.slot === 'auto')?.source).toBe('cloud');
  });

  it('works without cloud, reports missing slots, and finds the latest save', async () => {
    const m = new SaveManager(new LocalStore('test-solo'));
    m.attachCloud(null);
    expect(m.cloudStatus).toBe('off');
    expect(await m.load('slot1')).toEqual({ ok: false, error: 'not_found' });
    await m.save(createInitialState(1), 'slot1', 10);
    await m.save(step(createInitialState(1)), 'auto', 20);
    expect((await m.latest())?.slot).toBe('auto');
    await m.remove('auto');
    expect((await m.latest())?.slot).toBe('slot1');
  });

  it('keeps saving locally when the cloud rejects writes', async () => {
    const m = new SaveManager(new LocalStore('test-flaky'));
    m.attachCloud({ kind: 'cloud', get: async () => null, put: async () => Promise.reject(new Error('down')), remove: async () => undefined });
    const res = await m.save(createInitialState(1), 'slot1');
    expect(res).toEqual({ local: true, cloud: false });
    expect(m.cloudStatus).toBe('error');
    expect((await m.load('slot1')).ok).toBe(true);
  });
});
