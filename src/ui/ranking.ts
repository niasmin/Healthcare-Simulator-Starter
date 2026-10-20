import type { GameState } from '../domain/types';
import { playerStats } from '../sim/rivals';
import { dayOf } from '../sim/systems/time';
import type { RankEntry, SupabaseAccount } from '../storage/supabaseStore';

/**
 * The online ranking is opt-in: a signed-in player chooses to show their home, and from then on
 * every cloud autosave refreshes their row. The choice is remembered per browser.
 */
const OPT_IN_KEY = 'he.rank.optin';

export function rankOptedIn(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRankOptIn(on: boolean): void {
  try {
    if (on) localStorage.setItem(OPT_IN_KEY, '1');
    else localStorage.removeItem(OPT_IN_KEY);
  } catch {
    // Private windows may refuse storage; the choice then lasts for this page only.
  }
}

/** The name shown on the board: the sign-up name, else the part of the email before the @. */
export function displayName(account: SupabaseAccount | null): string {
  const raw = account?.name?.trim() || account?.email?.split('@')[0] || 'Player';
  return raw.slice(0, 40);
}

/** The row a home publishes: its numbers and its layout (no people, no money, no ledger). */
export function rankEntry(game: GameState, account: SupabaseAccount | null): RankEntry {
  const s = playerStats(game);
  return {
    display_name: displayName(account),
    home_name: game.organization.name ? game.organization.name.slice(0, 40) : null,
    score: s.score,
    residents: s.residents,
    beds: s.beds,
    reputation: s.reputation,
    satisfaction: s.satisfaction,
    staff: s.staff,
    stars: s.stars,
    day: dayOf(game.minute),
    chapter: game.chapter.id,
    site: game.site,
  };
}
