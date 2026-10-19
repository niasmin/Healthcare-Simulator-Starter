import { Texture } from 'pixi.js';
import type { DecorType, EquipmentId, StaffRole } from '../domain/types';

/** Sprite art cut from the project's Game Assets Pack (fictional, owned by the project). */
const urls = import.meta.glob('../assets/sprites/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

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
};

/** Full-body chibi sprite per staff role (from the character sheet). RN and PN share the nurse uniform. */
export const STAFF_SPRITE: Record<StaffRole, string> = { rn: 'ch_nurse', pn: 'ch_nurse', caregiver: 'ch_caregiver', pt: 'ch_pt', ot: 'ch_ot' };
/** Map width of a standing character, in world px. */
export const PERSON_SPRITE_WIDTH = 24;

export const DECOR_SPRITE: Record<DecorType, { name: string; width: number }> = {
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
};

/** Decode every sprite once and turn it into a Pixi texture. Missing or failed images are skipped. */
export async function loadSpriteTextures(): Promise<Map<string, Texture>> {
  const out = new Map<string, Texture>();
  await Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const name = path.split('/').pop()!.replace('.webp', '');
        out.set(name, Texture.from(img));
      } catch {
        /* keep the vector fallback for this one */
      }
    }),
  );
  return out;
}
