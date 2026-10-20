import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudStore, CHUNK } from '../storage/cloudStore';
import { SAVES_TABLE, SupabaseDB, authReason, supabaseConfig } from '../storage/supabaseStore';
import { encodeSave } from '../storage/format';
import { createInitialState } from '../sim/state';

/** In-memory stand-in for the slice of supabase-js the adapter uses, with the table's row rules. */
function fakeClient() {
  const rows = new Map<string, { user_id: string; slot: string; game_state: Record<string, unknown> }>();
  const key = (u: string, s: string) => `${u}|${s}`;
  const client = {
    from(table: string) {
      expect(table).toBe(SAVES_TABLE);
      const filters: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (col: string, v: string) => {
          filters[col] = v;
          return q;
        },
        maybeSingle: async () => {
          const r = rows.get(key(filters.user_id, filters.slot));
          return { data: r ? { game_state: r.game_state } : null, error: null };
        },
        upsert: async (r: { user_id: string; slot: string; game_state: Record<string, unknown> }) => {
          // The table's check: each document stays under 256 KiB, and slot names are 1–40 characters.
          expect(JSON.stringify(r.game_state).length).toBeLessThan(262_144);
          expect(r.slot.length).toBeGreaterThan(0);
          expect(r.slot.length).toBeLessThanOrEqual(40);
          rows.set(key(r.user_id, r.slot), r);
          return { error: null };
        },
        delete: () => ({
          eq: (c1: string, v1: string) => ({
            eq: async (c2: string, v2: string) => {
              const f = { [c1]: v1, [c2]: v2 };
              rows.delete(key(f.user_id, f.slot));
              return { error: null };
            },
          }),
        }),
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, rows };
}

describe('Supabase cloud saves', () => {
  it('round-trips a save through game_saves rows, one row per part, only under the player\'s id', async () => {
    const { client, rows } = fakeClient();
    const store = new CloudStore(new SupabaseDB(client, 'user-a'), 'user-a');
    const blob = await encodeSave(createInitialState(3), 'slot1', 1000);
    // A big payload spills into extra rows, each under the size check.
    const big = { ...blob, payload: blob.payload + 'x'.repeat(CHUNK * 2) };
    await store.put(big);
    expect([...rows.keys()].sort()).toEqual(['user-a|save-slot1', 'user-a|save-slot1.p1', 'user-a|save-slot1.p2']);
    expect((await store.get('slot1'))?.payload).toBe(big.payload);
    // Another player sees nothing of it.
    expect(await new CloudStore(new SupabaseDB(client, 'user-b'), 'user-b').get('slot1')).toBeNull();
    await store.remove('slot1');
    expect(rows.size).toBe(0);
  });

  it('is off without the project URL and key in the build environment', () => {
    expect(supabaseConfig()).toBeNull();
  });

  it('turns Supabase auth messages into reasons the sign-in window can explain', () => {
    expect(authReason('Invalid login credentials')).toBe('invalid_login');
    expect(authReason('Email not confirmed')).toBe('not_confirmed');
    expect(authReason('User already registered')).toBe('already_registered');
    expect(authReason('Password should be at least 6 characters.')).toBe('weak_password');
    expect(authReason('Unable to validate email address: invalid format')).toBe('invalid_email');
    expect(authReason('For security purposes, you can only request this after 30 seconds. Too many requests')).toBe('rate_limited');
    expect(authReason('Failed to fetch')).toBe('network');
    expect(authReason('Unsupported provider: provider is not enabled')).toBe('provider_off');
    expect(authReason('something else')).toBe('unknown');
  });
});
