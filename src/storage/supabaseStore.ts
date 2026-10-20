import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudStore, type DocRef, type MiniDB } from './cloudStore';

/**
 * Cloud saves in Supabase (for the deployed site; the Claude artifact keeps using its own `db`).
 * The CloudStore's documents `data/users/<id>/<name>` map onto rows of `public.game_saves`
 * (user_id, slot = <name>, game_state = the document). Row-level security lets each signed-in
 * player read and write only their own rows, and each row stays under the table's 256 KiB check
 * because CloudStore splits large saves into 200 000-character parts.
 *
 * Players start with an anonymous Supabase account (one per browser) and can sign in with an
 * email link to carry their saves to other devices.
 */

export const SAVES_TABLE = 'game_saves';

export class SupabaseDB implements MiniDB {
  constructor(
    private sb: SupabaseClient,
    private userId: string,
  ) {}

  doc(path: string): DocRef {
    const slot = path.split('/').pop()!;
    const row = () => this.sb.from(SAVES_TABLE).select('game_state').eq('user_id', this.userId).eq('slot', slot);
    return {
      get: async () => {
        const { data, error } = await row().maybeSingle();
        if (error) throw error;
        return { exists: !!data, data: () => (data?.game_state as Record<string, unknown> | undefined) };
      },
      set: async (d) => {
        const { error } = await this.sb.from(SAVES_TABLE).upsert({ user_id: this.userId, slot, game_state: d, updated_at: new Date().toISOString() });
        if (error) throw error;
      },
      delete: async () => {
        const { error } = await this.sb.from(SAVES_TABLE).delete().eq('user_id', this.userId).eq('slot', slot);
        if (error) throw error;
      },
    };
  }
}

export interface SupabaseAccount {
  email: string | null;
  anonymous: boolean;
}

export interface SupabaseConnection {
  store: CloudStore | null;
  account: SupabaseAccount | null;
  /** Send a one-time sign-in link; the saves follow the email account on every device. */
  sendLink(email: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  /** Called when the signed-in player changes (after following an email link). */
  onChange(fn: (store: CloudStore | null, account: SupabaseAccount | null) => void): void;
}

/** The project URL and publishable key come from the build environment; without them there is no Supabase. */
export function supabaseConfig(): { url: string; key: string } | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_KEY;
  return url && key ? { url, key } : null;
}

export async function connectSupabase(): Promise<SupabaseConnection | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    let { data } = await sb.auth.getSession();
    if (!data.session) {
      // Anonymous sign-in (if the project allows it) gives this browser its own private saves at once.
      const anon = await sb.auth.signInAnonymously();
      if (!anon.error) data = { session: anon.data.session };
    }
    const toAccount = (u: { email?: string | null; is_anonymous?: boolean } | null | undefined): SupabaseAccount | null => (u ? { email: u.email ?? null, anonymous: !!u.is_anonymous } : null);
    const user = data.session?.user ?? null;
    const listeners: Array<(store: CloudStore | null, account: SupabaseAccount | null) => void> = [];
    let currentId = user?.id ?? null;
    sb.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      if (id === currentId) return;
      currentId = id;
      const store = id ? new CloudStore(new SupabaseDB(sb, id), id) : null;
      for (const fn of listeners) fn(store, toAccount(session?.user));
    });
    return {
      store: user ? new CloudStore(new SupabaseDB(sb, user.id), user.id) : null,
      account: toAccount(user),
      sendLink: async (email) => {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href.split('#')[0] } });
        return error ? { ok: false, error: error.message } : { ok: true };
      },
      signOut: async () => {
        await sb.auth.signOut();
      },
      onChange: (fn) => listeners.push(fn),
    };
  } catch {
    return null;
  }
}
