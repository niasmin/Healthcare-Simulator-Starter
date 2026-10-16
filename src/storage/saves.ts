import type { GameState } from '../domain/types';
import { decodeSave, encodeSave, SLOTS, type LoadError, type SaveMeta, type SlotId } from './format';
import type { SaveStore } from './localStore';

export type CloudStatus = 'connecting' | 'on' | 'off' | 'error';

export interface SlotInfo {
  slot: SlotId;
  meta: SaveMeta | null;
  /** Where the newest copy of this slot lives. */
  source: 'local' | 'cloud' | null;
}

/**
 * Saves every slot to this browser, and also to the player's private cloud space
 * when available. Loading picks whichever copy is newer, so a game saved on a
 * phone continues on a PC (and vice versa) for the same signed-in player.
 */
export class SaveManager {
  private cloud: SaveStore | null = null;
  cloudStatus: CloudStatus = 'connecting';

  constructor(private local: SaveStore) {}

  attachCloud(store: SaveStore | null): void {
    this.cloud = store;
    this.cloudStatus = store ? 'on' : 'off';
  }

  async save(state: GameState, slot: SlotId, savedAt = Date.now()): Promise<{ local: boolean; cloud: boolean }> {
    const blob = await encodeSave(state, slot, savedAt);
    let local = false;
    let cloud = false;
    try {
      await this.local.put(blob);
      local = true;
    } catch {
      /* reported via return value */
    }
    if (this.cloud) {
      try {
        await this.cloud.put(blob);
        cloud = true;
        this.cloudStatus = 'on';
      } catch {
        this.cloudStatus = 'error';
      }
    }
    return { local, cloud };
  }

  private async newest(slot: SlotId) {
    const [l, c] = await Promise.all([
      this.local.get(slot).catch(() => null),
      this.cloud ? this.cloud.get(slot).catch(() => null) : Promise.resolve(null),
    ]);
    if (l && c) return c.meta.savedAt > l.meta.savedAt ? { blob: c, source: 'cloud' as const } : { blob: l, source: 'local' as const };
    if (c) return { blob: c, source: 'cloud' as const };
    if (l) return { blob: l, source: 'local' as const };
    return null;
  }

  async list(): Promise<SlotInfo[]> {
    return Promise.all(
      SLOTS.map(async (slot) => {
        const n = await this.newest(slot);
        return { slot, meta: n?.blob.meta ?? null, source: n?.source ?? null };
      }),
    );
  }

  async load(slot: SlotId): Promise<{ ok: true; state: GameState } | { ok: false; error: LoadError }> {
    const n = await this.newest(slot);
    if (!n) return { ok: false, error: 'not_found' };
    return decodeSave(n.blob);
  }

  /** The most recently saved slot, for "Continue". */
  async latest(): Promise<SlotInfo | null> {
    const all = (await this.list()).filter((s) => s.meta);
    all.sort((a, b) => b.meta!.savedAt - a.meta!.savedAt);
    return all[0] ?? null;
  }

  async remove(slot: SlotId): Promise<void> {
    await this.local.remove(slot).catch(() => undefined);
    if (this.cloud) await this.cloud.remove(slot).catch(() => undefined);
  }
}
