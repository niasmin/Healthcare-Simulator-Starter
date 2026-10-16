import type { SaveBlob, SaveMeta, SlotId } from './format';
import type { SaveStore } from './localStore';

/**
 * Per-person cloud saves through the published page's `db` capability.
 * Each player's saves live in their private subtree `data/users/<id>/`,
 * which nobody else (not even the page owner) can read. A save document holds
 * the summary plus up to CHUNK characters of payload; longer payloads spill
 * into `<slot>.p1`, `<slot>.p2`, … so no document exceeds the 256 KiB limit.
 */

/** Minimal slice of the platform db API this store uses (also implemented by tests). */
export interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface MiniDB {
  doc(path: string): DocRef;
}

export const CHUNK = 200_000;
const MAX_PARTS = 40;

export class CloudStore implements SaveStore {
  readonly kind = 'cloud' as const;
  constructor(
    private db: MiniDB,
    private userId: string,
  ) {}

  private ref(slot: SlotId, part = 0): DocRef {
    return this.db.doc(`data/users/${this.userId}/${part ? `save-${slot}.p${part}` : `save-${slot}`}`);
  }

  async get(slot: SlotId): Promise<SaveBlob | null> {
    const head = await this.ref(slot).get();
    if (!head.exists) return null;
    const d = head.data() as { meta: SaveMeta; encoding: SaveBlob['encoding']; parts: number; chunk: string };
    let payload = d.chunk;
    for (let i = 1; i < d.parts; i++) {
      const p = await this.ref(slot, i).get();
      if (!p.exists) return null; // a half-written save is treated as missing
      payload += (p.data() as { chunk: string }).chunk;
    }
    return { meta: d.meta, encoding: d.encoding, payload };
  }

  async put(blob: SaveBlob): Promise<void> {
    const chunks: string[] = [];
    for (let i = 0; i < blob.payload.length; i += CHUNK) chunks.push(blob.payload.slice(i, i + CHUNK));
    if (!chunks.length) chunks.push('');
    if (chunks.length > MAX_PARTS) throw new Error('save_too_large');
    // Write the extra parts first, the head last, so a reader never sees a head pointing at missing parts.
    for (let i = 1; i < chunks.length; i++) await this.ref(blob.meta.slot, i).set({ chunk: chunks[i] });
    await this.ref(blob.meta.slot).set({ meta: blob.meta as unknown as Record<string, unknown>, encoding: blob.encoding, parts: chunks.length, chunk: chunks[0] });
  }

  async remove(slot: SlotId): Promise<void> {
    const head = await this.ref(slot).get();
    const parts = head.exists ? Number((head.data() as { parts?: number }).parts ?? 1) : 1;
    await this.ref(slot).delete();
    for (let i = 1; i < parts; i++) await this.ref(slot, i).delete();
  }
}

/** Connect to the platform db + user capabilities when this page runs inside a viewer that grants them. */
export async function connectCloud(): Promise<CloudStore | null> {
  try {
    const claude = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
    if (!claude?.use) return null;
    const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [MiniDB | null, { id(): Promise<string | null> } | null];
    if (!db || !user) return null;
    const id = await user.id();
    if (!id) return null;
    return new CloudStore(db, id);
  } catch {
    return null;
  }
}
