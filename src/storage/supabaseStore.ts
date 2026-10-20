import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudStore, type DocRef, type MiniDB } from './cloudStore';
import type { Site } from '../domain/types';

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
  /** The name the player chose when signing up (stored in the account's metadata). */
  name: string | null;
  /** Older accounts made automatically before sign-in existed. */
  anonymous: boolean;
}

/** An auth result the UI can show: ok, or one of a few known reasons (anything else is 'unknown'). */
export type AuthResult = { ok: true; needsConfirm?: boolean } | { ok: false; reason: AuthError; message?: string };
export type OAuthProvider = 'google';
export type AuthError = 'provider_off' | 'invalid_login' | 'not_confirmed' | 'already_registered' | 'weak_password' | 'invalid_email' | 'rate_limited' | 'network' | 'unknown';

export function authReason(message: string | undefined): AuthError {
  const m = (message ?? '').toLowerCase();
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'provider_off';
  if (m.includes('invalid login')) return 'invalid_login';
  if (m.includes('not confirmed')) return 'not_confirmed';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) return 'already_registered';
  if (m.includes('password')) return 'weak_password';
  if (m.includes('email') && (m.includes('invalid') || m.includes('valid'))) return 'invalid_email';
  if (m.includes('rate') || m.includes('too many')) return 'rate_limited';
  if (m.includes('fetch') || m.includes('network')) return 'network';
  return 'unknown';
}

export interface SupabaseConnection {
  store: CloudStore | null;
  account: SupabaseAccount | null;
  signIn(email: string, password: string): Promise<AuthResult>;
  /** New account. When the project asks for email confirmation, there is no session until the link is followed. */
  signUp(email: string, password: string, name: string): Promise<AuthResult>;
  /** Email a link that opens the game in "choose a new password" mode. */
  resetPassword(email: string): Promise<AuthResult>;
  /** Set a new password (after following a reset link, or while signed in). */
  updatePassword(password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** Sign in with Google: the browser goes to Google and comes back signed in. */
  signInWith(provider: OAuthProvider): Promise<AuthResult>;
  /** Whether the project has switched Google on (Auth → Providers), so the button shows only when it works. */
  providers(): Promise<Record<OAuthProvider, boolean>>;
  /** True after the player followed a password-reset link and should choose a new password. */
  recovering: boolean;
  /** Called when the signed-in player changes. */
  onChange(fn: (store: CloudStore | null, account: SupabaseAccount | null) => void): void;
  /** Add anonymous play statistics (insert-only table; see the game_events migration). */
  logEvents(rows: GameEventRow[]): Promise<boolean>;
  /** The signed-in player's id, or null. */
  userId(): string | null;
  /** Put (or refresh) the signed-in player's home on the public ranking. */
  publishRank(entry: RankEntry): Promise<boolean>;
  /** Take the player's home off the ranking. */
  withdrawRank(): Promise<boolean>;
  /** The public ranking, best first (without the site layouts). */
  leaderboard(limit?: number): Promise<RankRecord[]>;
  /** One player's published layout, for a visit. */
  rankSite(userId: string): Promise<Site | null>;
}

export const RANK_TABLE = 'leaderboard';
export interface RankEntry {
  display_name: string;
  home_name: string | null;
  score: number;
  residents: number;
  beds: number;
  reputation: number;
  satisfaction: number;
  staff: number;
  day: number;
  chapter: number;
  site: Site;
}
export type RankRecord = Omit<RankEntry, 'site'> & { user_id: string; updated_at: string };
const RANK_COLUMNS = 'user_id,display_name,home_name,score,residents,beds,reputation,satisfaction,staff,day,chapter,updated_at';

export const EVENTS_TABLE = 'game_events';
export interface GameEventRow {
  session: string;
  kind: 'game_start' | 'chapter_result' | 'goal_done' | 'autopilot' | 'session_ping';
  chapter?: number;
  day?: number;
  data?: Record<string, unknown>;
}

/** The project URL and publishable key come from the build environment; without them there is no Supabase. */
export function supabaseConfig(): { url: string; key: string } | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_KEY;
  return url && key ? { url, key } : null;
}

const toAccount = (u: { email?: string | null; is_anonymous?: boolean; user_metadata?: Record<string, unknown> } | null | undefined): SupabaseAccount | null =>
  u ? { email: u.email ?? null, name: typeof u.user_metadata?.name === 'string' ? (u.user_metadata.name as string) : null, anonymous: !!u.is_anonymous } : null;

/**
 * Connect to Supabase for cloud saves. Players sign in with an email and password (or play as a
 * guest, whose saves stay in this browser). No account is made automatically.
 */
export async function connectSupabase(): Promise<SupabaseConnection | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    // A password-reset link lands here with type=recovery; read it before the client tidies the URL.
    const fromRecoveryLink = /type=recovery/.test(window.location.hash + window.location.search);
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await sb.auth.getSession();
    const user = data.session?.user ?? null;
    const listeners: Array<(store: CloudStore | null, account: SupabaseAccount | null) => void> = [];
    let currentId = user?.id ?? null;
    const redirect = () => window.location.href.split('#')[0].split('?')[0];
    const fail = (message: string | undefined): AuthResult => ({ ok: false, reason: authReason(message), message });
    const conn: SupabaseConnection = {
      store: user ? new CloudStore(new SupabaseDB(sb, user.id), user.id) : null,
      account: toAccount(user),
      recovering: fromRecoveryLink,
      signIn: async (email, password) => {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return error ? fail(error.message) : { ok: true };
      },
      signUp: async (email, password, name) => {
        const { data: d, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirect() } });
        if (error) return fail(error.message);
        // An address that already has an account comes back with no identities (Supabase hides which).
        if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) return { ok: false, reason: 'already_registered' };
        return { ok: true, needsConfirm: !d.session };
      },
      signInWith: async (provider) => {
        const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirect() } });
        return error ? fail(error.message) : { ok: true };
      },
      providers: async () => {
        try {
          const res = await fetch(`${cfg.url}/auth/v1/settings`, { headers: { apikey: cfg.key } });
          const body = (await res.json()) as { external?: Record<string, boolean> };
          return { google: !!body.external?.google };
        } catch {
          return { google: false };
        }
      },
      resetPassword: async (email) => {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
        return error ? fail(error.message) : { ok: true };
      },
      updatePassword: async (password) => {
        const { error } = await sb.auth.updateUser({ password });
        if (error) return fail(error.message);
        conn.recovering = false;
        return { ok: true };
      },
      signOut: async () => {
        await sb.auth.signOut();
      },
      onChange: (fn) => listeners.push(fn),
      logEvents: async (rows) => {
        if (!currentId || !rows.length) return false;
        // No select: players may add events but never read them back.
        const { error } = await sb.from(EVENTS_TABLE).insert(rows.map((r) => ({ ...r, user_id: currentId })));
        return !error;
      },
      userId: () => currentId,
      publishRank: async (entry) => {
        if (!currentId) return false;
        const { error } = await sb.from(RANK_TABLE).upsert({ ...entry, user_id: currentId, updated_at: new Date().toISOString() });
        return !error;
      },
      withdrawRank: async () => {
        if (!currentId) return false;
        const { error } = await sb.from(RANK_TABLE).delete().eq('user_id', currentId);
        return !error;
      },
      leaderboard: async (limit = 30) => {
        const { data: rows, error } = await sb.from(RANK_TABLE).select(RANK_COLUMNS).order('score', { ascending: false }).limit(limit);
        return error || !rows ? [] : (rows as unknown as RankRecord[]);
      },
      rankSite: async (userId) => {
        const { data: row, error } = await sb.from(RANK_TABLE).select('site').eq('user_id', userId).maybeSingle();
        return error || !row ? null : ((row as { site: Site | null }).site ?? null);
      },
    };
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') conn.recovering = true;
      const id = session?.user?.id ?? null;
      const account = toAccount(session?.user);
      if (id === currentId && event !== 'PASSWORD_RECOVERY' && event !== 'USER_UPDATED') return;
      currentId = id;
      conn.account = account;
      conn.store = id ? new CloudStore(new SupabaseDB(sb, id), id) : null;
      for (const fn of listeners) fn(conn.store, account);
    });
    return conn;
  } catch {
    return null;
  }
}
