import { reconcile } from '../domain/rules/ledger';
import type { GameState } from '../domain/types';
import { dayOf } from '../sim/systems/time';

/**
 * Versioned save format. A save is the complete GameState (plain JSON, so a
 * reloaded game continues exactly as the original would) plus a small summary
 * shown in the slot list. Payloads are gzip-compressed when the runtime offers
 * CompressionStream, so even long games stay far below storage limits.
 */
export const SAVE_FORMAT = 1;
export const CURRENT_SCHEMA = 4;

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

export interface SaveMeta {
  slot: SlotId;
  format: number;
  schemaVersion: number;
  /** Real-world time of the save (ms since epoch). Used to pick the newest copy. */
  savedAt: number;
  day: number;
  minute: number;
  cashSatang: number;
  residents: number;
  staff: number;
  reputation: number;
}

export interface SaveBlob {
  meta: SaveMeta;
  encoding: 'gzip-b64' | 'json';
  payload: string;
}

export type LoadError = 'not_found' | 'corrupt' | 'incompatible';

export function metaOf(state: GameState, slot: SlotId, savedAt: number): SaveMeta {
  return {
    slot,
    format: SAVE_FORMAT,
    schemaVersion: state.schemaVersion,
    savedAt,
    day: dayOf(state.minute),
    minute: state.minute,
    cashSatang: state.organization.cashSatang,
    residents: state.residents.length,
    staff: state.employees.length,
    reputation: state.organization.reputation,
  };
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeSave(state: GameState, slot: SlotId, savedAt = Date.now()): Promise<SaveBlob> {
  const json = JSON.stringify(state);
  const meta = metaOf(state, slot, savedAt);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const gz = await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'));
      return { meta, encoding: 'gzip-b64', payload: toB64(gz) };
    } catch {
      /* fall through to plain JSON */
    }
  }
  return { meta, encoding: 'json', payload: json };
}

/** Decode and validate. Never throws: a bad save is reported, not loaded. */
export async function decodeSave(blob: SaveBlob): Promise<{ ok: true; state: GameState } | { ok: false; error: LoadError }> {
  try {
    if (!blob || typeof blob.payload !== 'string' || !blob.meta) return { ok: false, error: 'corrupt' };
    if (blob.meta.format > SAVE_FORMAT) return { ok: false, error: 'incompatible' };
    let json = blob.payload;
    if (blob.encoding === 'gzip-b64') {
      if (typeof DecompressionStream === 'undefined') return { ok: false, error: 'incompatible' };
      json = new TextDecoder().decode(await pipe(fromB64(blob.payload), new DecompressionStream('gzip')));
    }
    const state = JSON.parse(json) as GameState;
    return validate(state);
  } catch {
    return { ok: false, error: 'corrupt' };
  }
}

/** Upgrade older saves step by step to the current schema. */
export function migrate(state: GameState): GameState {
  let s = state as Omit<GameState, 'schemaVersion'> & { schemaVersion: number };
  if (s.schemaVersion === 3) {
    // v4 adds garden decorations to the site.
    s = { ...s, schemaVersion: 4, site: { ...s.site, decor: [] } };
  }
  return s as GameState;
}

/** Structural checks plus the cash-ledger invariant. Older schemas are migrated first. */
export function validate(input: GameState): { ok: true; state: GameState } | { ok: false; error: LoadError } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'corrupt' };
  const state = migrate(input);
  if (state.schemaVersion !== CURRENT_SCHEMA) return { ok: false, error: 'incompatible' };
  const arrays = [state.ledger, state.site?.rooms, state.site?.corridor, state.site?.decor, state.residents, state.employees, state.shifts, state.tasks, state.invoices, state.queue];
  if (arrays.some((a) => !Array.isArray(a))) return { ok: false, error: 'corrupt' };
  if (!Number.isFinite(state.minute) || !state.organization || !state.events) return { ok: false, error: 'corrupt' };
  if (!reconcile(state).ok) return { ok: false, error: 'corrupt' };
  return { ok: true, state };
}
