import type { Texture } from 'pixi.js';
import type { DecorType, EquipmentId, RoomType, StaffRole } from '../domain/types';

/** Sprite art cut from the project's Game Assets Pack (fictional, owned by the project). */
const urls = import.meta.glob('../assets/sprites/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
/** White map-label glyphs (cut from the play-screen concept art); tinted by the label pill. */
const glyphs = import.meta.glob('../assets/hud/g_*.png', { eager: true, import: 'default' }) as Record<string, string>;

export function spriteUrl(name: string): string | undefined {
  return urls[`../assets/sprites/${name}.webp`];
}

/** Map-scale sprite for each piece of equipment (width in world px; one tile is 64 px wide). */
export const EQUIP_SPRITE: Partial<Record<EquipmentId, { name: string; width: number }>> = {
  care_bed: { name: 'eq_bed', width: 54 },
  call_system: { name: 'eq_monitor', width: 28 },
  med_cart: { name: 'eq_medcart', width: 34 },
  nurse_desk: { name: 'eq_cart', width: 30 },
  exercise_mat: { name: 'eq_ball', width: 26 },
  parallel_bars: { name: 'eq_bars', width: 56 },
  lockers: { name: 'eq_cabinet', width: 34 },
  rest_sofa: { name: 'eq_sofa', width: 44 },
  feeding_pump: { name: 'eq_pump', width: 22 },
  suction_unit: { name: 'eq_suction', width: 26 },
  // Chapter 5–6 rooms (from the rooms & equipment sheet).
  exam_desk: { name: 'eq_reception', width: 52 },
  waiting_chairs: { name: 'eq_waiting', width: 46 },
  vital_monitor: { name: 'eq_exam', width: 26 },
  training_manikin: { name: 'eq_therapy', width: 44 },
  whiteboard: { name: 'eq_board', width: 30 },
  medicine_shelf: { name: 'eq_medshelf', width: 30 },
  dining_table: { name: 'eq_dining', width: 50 },
  reception_desk: { name: 'eq_reception', width: 56 },
  washer: { name: 'eq_washer', width: 24 },
  storage_rack: { name: 'eq_rack', width: 34 },
  bath_set: { name: 'eq_bath', width: 46 },
  office_desk: { name: 'eq_reception', width: 44 },
};

/** Map-label pill per room type: glyph texture name and pill colour. */
export const ROOM_BADGE: Record<RoomType, { glyph: string; color: number }> = {
  ward: { glyph: 'g_bed', color: 0xd9485f },
  nursing_station: { glyph: 'g_nurse', color: 0x6a4fdc },
  therapy: { glyph: 'g_walk', color: 0x1e9e6a },
  staff_room: { glyph: 'g_sofa', color: 0x2f74d8 },
  villa: { glyph: 'g_bed', color: 0xc7862a },
  homecare_office: { glyph: 'g_doc', color: 0x56606d },
  training_room: { glyph: 'g_doc', color: 0x1f8a9a },
  neuro_clinic: { glyph: 'g_nurse', color: 0x3b5ba5 },
  stroke_unit: { glyph: 'g_bed', color: 0x7a4fa0 },
  pharmacy: { glyph: 'g_doc', color: 0x2a7f7f },
  dining_room: { glyph: 'g_sofa', color: 0xc9771f },
  laundry_room: { glyph: 'g_doc', color: 0x5f6b78 },
  reception: { glyph: 'g_doc', color: 0x4b4fc4 },
  storage_room: { glyph: 'g_doc', color: 0x8a6a45 },
  bathroom: { glyph: 'g_bed', color: 0x3f8fae },
  accounting_office: { glyph: 'g_doc', color: 0x3c6e47 },
};

/** Full-body chibi sprite per staff role (from the character sheet). RN and PN share the nurse uniform. */
export const STAFF_SPRITE: Record<StaffRole, string> = { rn: 'ch_nurse', pn: 'ch_nurse', caregiver: 'ch_caregiver', pt: 'ch_pt', ot: 'ch_ot', doctor: 'ch_doctor', pharmacist: 'ch_pharmacist', nutritionist: 'ch_nutritionist', cleaner: 'ch_cleaner', receptionist: 'ch_receptionist', security: 'ch_security', accountant: 'ch_accountant' };
/** Residents out of bed (strolling in the garden or the dining room). */
export const RESIDENT_SPRITE = { f: 'ch_elder_f', m: 'ch_elder_m', chair: 'ch_wheelchair' } as const;
/** Map width of a standing character, in world px. */
export const PERSON_SPRITE_WIDTH = 24;

/** Garden sprites; star-shop pieces reuse the pack's art with a tint (the statue is drawn). */
export const DECOR_SPRITE: Record<DecorType, { name: string; width: number; tint?: number; emoji?: string }> = {
  tree: { name: 'dc_tree', width: 70 },
  tree2: { name: 'dc_tree2', width: 64 },
  sakura: { name: 'dc_sakura', width: 72 },
  flowers: { name: 'dc_flowers', width: 46 },
  hedge: { name: 'dc_hedge', width: 60 },
  planter: { name: 'dc_planter', width: 46 },
  lamp: { name: 'dc_lamp', width: 16 },
  umbrella: { name: 'dc_umbrella', width: 62 },
  fountain: { name: 'dc_fountain', width: 86 },
  gazebo: { name: 'dc_gazebo', width: 84 },
  gold_fountain: { name: 'dc_fountain', width: 96, tint: 0xffd46a },
  sakura_arch: { name: 'dc_gazebo', width: 88, tint: 0xffb8d2 },
  statue: { name: 'statue', width: 40 },
  gold_lantern: { name: 'dc_lamp', width: 22, tint: 0xffcf4d },
  // Drawn (no art in the pack); the menu shows the emoji.
  pond: { name: 'pond', width: 64, emoji: '🪷' },
};

/** Decode every sprite once and turn it into a Pixi texture. Missing or failed images are skipped. */
export async function loadSpriteTextures(): Promise<Map<string, Texture>> {
  // Pixi loads with the map, so the title screen and menus never wait for it.
  const { Texture } = await import('pixi.js');
  const out = new Map<string, Texture>();
  await Promise.all(
    Object.entries({ ...urls, ...glyphs }).map(async ([path, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const name = path.split('/').pop()!.replace(/\.(webp|png)$/, '');
        out.set(name, Texture.from(img));
      } catch {
        /* keep the vector fallback for this one */
      }
    }),
  );
  return out;
}
