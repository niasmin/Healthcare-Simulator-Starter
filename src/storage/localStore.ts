import Dexie, { type Table } from 'dexie';
import type { SaveBlob, SlotId } from './format';

/** Saves kept in this browser (IndexedDB via Dexie). Falls back to memory if IndexedDB is blocked. */
export interface SaveStore {
  readonly kind: 'local' | 'cloud';
  get(slot: SlotId): Promise<SaveBlob | null>;
  put(blob: SaveBlob): Promise<void>;
  remove(slot: SlotId): Promise<void>;
}

interface Row extends SaveBlob {
  slot: SlotId;
}

class SaveDB extends Dexie {
  saves!: Table<Row, SlotId>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ saves: 'slot' });
  }
}

export class LocalStore implements SaveStore {
  readonly kind = 'local' as const;
  private db: SaveDB | null;
  private memory = new Map<SlotId, SaveBlob>();

  constructor(name = 'healthcare-empire-saves') {
    try {
      this.db = typeof indexedDB === 'undefined' ? null : new SaveDB(name);
    } catch {
      this.db = null;
    }
  }

  async get(slot: SlotId): Promise<SaveBlob | null> {
    if (this.db) {
      try {
        const row = await this.db.saves.get(slot);
        if (row) return { meta: row.meta, encoding: row.encoding, payload: row.payload };
        return null;
      } catch {
        this.db = null; // private mode / blocked: keep going in memory
      }
    }
    return this.memory.get(slot) ?? null;
  }

  async put(blob: SaveBlob): Promise<void> {
    if (this.db) {
      try {
        await this.db.saves.put({ slot: blob.meta.slot, ...blob });
        return;
      } catch {
        this.db = null;
      }
    }
    this.memory.set(blob.meta.slot, blob);
  }

  async remove(slot: SlotId): Promise<void> {
    if (this.db) {
      try {
        await this.db.saves.delete(slot);
        return;
      } catch {
        this.db = null;
      }
    }
    this.memory.delete(slot);
  }
}
