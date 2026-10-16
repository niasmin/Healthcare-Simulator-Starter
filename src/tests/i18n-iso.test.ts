import { DICTS, translate } from '../ui/i18n';
import { ROOM_TYPES, EQUIPMENT } from '../data/rooms';
import { cellCenter, worldToCell } from '../render/iso';

describe('localisation', () => {
  it('Thai and English dictionaries have identical keys', () => {
    expect(Object.keys(DICTS.th).sort()).toEqual(Object.keys(DICTS.en).sort());
  });

  it('every room type, equipment and reason code has a label', () => {
    const reasons = ['out_of_bounds', 'too_small', 'too_large', 'overlap', 'insufficient_funds', 'nothing_to_build', 'not_found',
      'cannot_remove_entrance', 'equipment_not_allowed', 'equipment_limit', 'equipment_none', 'equipment_required', 'invalid_speed'];
    for (const lang of ['th', 'en'] as const) {
      for (const r of ROOM_TYPES) expect(DICTS[lang][`room.${r}`]).toBeTruthy();
      for (const e of Object.keys(EQUIPMENT)) expect(DICTS[lang][`equip.${e}`]).toBeTruthy();
      for (const r of reasons) expect(DICTS[lang][`reason.${r}`]).toBeTruthy();
    }
  });

  it('renders Thai text with interpolated, translated params', () => {
    expect(translate('th', 'log.room_built', { room: 'ward' })).toBe('สร้างห้องพักผู้สูงอายุเสร็จแล้ว');
    expect(translate('en', 'log.room_built', { room: 'ward' })).toBe('Resident ward completed');
    expect(translate('th', 'top.day', { day: 3 })).toBe('วันที่ 3');
    expect(/[฀-๿]/.test(DICTS.th['app.title'])).toBe(true);
  });
});

describe('isometric projection', () => {
  it('worldToCell inverts the cell centre for every grid cell', () => {
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) {
        const c = cellCenter(x, y);
        expect(worldToCell(c.x, c.y)).toEqual({ x, y });
      }
  });
});
