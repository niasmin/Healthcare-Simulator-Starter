export type Lang = 'th' | 'en';

type Dict = Record<string, string>;

const th: Dict = {
  'app.title': 'เฮลท์แคร์ เอ็มไพร์',
  'app.subtitle': 'Care & Beyond',
  'top.day': 'วันที่ {day}',
  'top.cash': 'เงินสด',
  'top.reputation': 'ชื่อเสียง',
  'top.pause': 'หยุด',
  'top.new_game': 'เริ่มใหม่',
  'top.new_game_confirm': 'เริ่มเกมใหม่? ความคืบหน้าปัจจุบันจะหายไป',
  'top.new_game_sure': 'กดอีกครั้งเพื่อเริ่มใหม่',
  'top.lang': 'EN',

  'tab.build': 'ก่อสร้าง',
  'tab.hire': 'จ้างพนักงาน',
  'tab.admit': 'รับผู้พักอาศัย',
  'tab.locked': 'เปิดใช้ในเฟส 2',

  'tool.select': 'เลือก / เลื่อนแผนที่',
  'tool.select.hint': 'คลิกห้องเพื่อดูรายละเอียด ลากเพื่อเลื่อนแผนที่',
  'tool.corridor': 'ทางเดิน',
  'tool.corridor.hint': 'ลากเพื่อปูทางเดิน ห้องต้องติดทางเดินที่เชื่อมกับประตูหน้า',
  'tool.bulldoze': 'รื้อถอน',
  'tool.bulldoze.hint': 'คลิกห้องหรือทางเดินเพื่อรื้อ คืนเงิน {pct}%',
  'tool.room.hint': 'ลากเพื่อกำหนดขนาดห้อง ด้านสั้นสุด {minSide} ช่อง พื้นที่ {minArea}–{maxArea} ช่อง',
  'tool.per_tile': '/ช่อง',
  'tool.base': 'ฐาน',

  'room.ward': 'ห้องพักผู้สูงอายุ',
  'room.nursing_station': 'สถานีพยาบาล',
  'room.therapy': 'ห้องกายภาพบำบัด',
  'room.staff_room': 'ห้องพักพนักงาน',
  'room.ward.desc': 'เตียงสำหรับผู้พักอาศัย 1 เตียงต่อ 2 ช่อง',
  'room.nursing_station.desc': 'ศูนย์ประสานงานการดูแลของทีมพยาบาล',
  'room.therapy.desc': 'พื้นที่ฟื้นฟูการเคลื่อนไหว (เชิงนามธรรม)',
  'room.staff_room.desc': 'พื้นที่พักของพนักงาน ช่วยเรื่องพลังงานและขวัญกำลังใจ',
  'room.corridor': 'ทางเดิน',
  'room.entrance': 'ประตูหน้า',
  'room.empty': 'พื้นที่ว่าง',

  'equip.care_bed': 'เตียงปรับระดับ',
  'equip.call_system': 'ระบบกริ่งเรียก',
  'equip.med_cart': 'รถเข็นเวชภัณฑ์',
  'equip.nurse_desk': 'เคาน์เตอร์พยาบาล',
  'equip.exercise_mat': 'เบาะออกกำลังกาย',
  'equip.parallel_bars': 'ราวฝึกเดิน',
  'equip.lockers': 'ตู้ล็อกเกอร์',
  'equip.rest_sofa': 'โซฟาพักผ่อน',

  'inspector.title': 'รายละเอียด',
  'inspector.none': 'เลือกห้องบนแผนที่เพื่อดูรายละเอียด',
  'inspector.size': 'ขนาด',
  'inspector.cells': '{w}×{h} ({area} ช่อง)',
  'inspector.status': 'สถานะ',
  'inspector.operational': 'พร้อมใช้งาน',
  'inspector.not_operational': 'ยังใช้งานไม่ได้',
  'inspector.capacity': 'ความจุ',
  'inspector.beds': '{n} เตียง',
  'inspector.equipment': 'อุปกรณ์',
  'inspector.required': 'จำเป็น',
  'inspector.optional': 'เสริม',
  'inspector.demolish': 'รื้อถอนห้อง (คืน {amount})',
  'inspector.upkeep': 'ค่าดูแลรายวัน',
  'inspector.cell': 'ช่อง ({x}, {y})',
  'issue.no_access': 'ไม่มีทางเข้า: ต้องมีทางเดินที่เชื่อมกับประตูหน้ามาติดห้อง',
  'issue.missing_equipment': 'ขาด {equipment} ({have}/{need})',

  'alerts.title': 'การแจ้งเตือน',
  'alerts.empty': 'ยังไม่มีการแจ้งเตือน',
  'log.room_built': 'สร้าง{room}เสร็จแล้ว',
  'log.room_demolished': 'รื้อถอน{room}แล้ว',
  'log.day_upkeep': 'ชำระค่าดูแลอาคารประจำวัน',

  'dash.cash': 'เงินสด',
  'dash.invested': 'ลงทุนก่อสร้าง',
  'dash.upkeep': 'ค่าดูแลต่อวัน',
  'dash.rooms': 'ห้องพร้อมใช้',
  'dash.beds': 'เตียงพร้อมใช้',
  'dash.occupancy': 'อัตราการเข้าพัก',
  'dash.quality': 'คุณภาพการดูแล',
  'dash.phase2': 'เฟส 2',
  'dash.goals': 'เป้าหมายการก่อสร้าง',

  'goal.corridor': 'ปูทางเดินจากประตูหน้าอย่างน้อย 6 ช่อง',
  'goal.connected': 'เชื่อมห้องแรกเข้ากับทางเดิน',
  'goal.beds': 'เปิดเตียงพร้อมใช้ {n} เตียง',
  'goal.station': 'เปิดสถานีพยาบาล',
  'goal.staff_room': 'เปิดห้องพักพนักงาน',
  'goal.therapy': 'เปิดห้องกายภาพบำบัด',
  'goal.cash': 'เปิดใช้ 3 ห้องขึ้นไปโดยเงินสดยังเป็นบวก',

  'reason.out_of_bounds': 'อยู่นอกพื้นที่',
  'reason.too_small': 'ห้องเล็กเกินไป (ด้านสั้นสุด {minSide}, พื้นที่อย่างน้อย {minArea})',
  'reason.too_large': 'ห้องใหญ่เกินไป (สูงสุด {maxArea} ช่อง)',
  'reason.overlap': 'ทับซ้อนกับสิ่งก่อสร้างอื่น',
  'reason.insufficient_funds': 'เงินไม่พอ',
  'reason.nothing_to_build': 'มีทางเดินอยู่แล้ว',
  'reason.not_found': 'ไม่พบสิ่งก่อสร้าง',
  'reason.cannot_remove_entrance': 'ไม่สามารถรื้อประตูหน้าได้',
  'reason.equipment_not_allowed': 'อุปกรณ์นี้ใช้กับห้องนี้ไม่ได้',
  'reason.equipment_limit': 'ติดตั้งครบจำนวนสูงสุดแล้ว ({max})',
  'reason.equipment_none': 'ไม่มีอุปกรณ์ให้ถอด',
  'reason.equipment_required': 'อุปกรณ์จำเป็น',
  'reason.invalid_speed': 'ความเร็วไม่ถูกต้อง',
  'preview.ok': 'วางได้',

  'ledger.capital': 'ทุนเริ่มต้น',
  'ledger.construction_room': 'ก่อสร้าง{room}',
  'ledger.construction_corridor': 'ปูทางเดิน {tiles} ช่อง',
  'ledger.equipment': 'ซื้อ{equipment}',
  'ledger.refund_room': 'คืนเงินรื้อถอน{room}',
  'ledger.refund_corridor': 'คืนเงินรื้อทางเดิน',
  'ledger.refund_equipment': 'คืนเงินขาย{equipment}',
  'ledger.upkeep': 'ค่าดูแลอาคาร วันที่ {day}',

  'canvas.zoom_in': 'ซูมเข้า',
  'canvas.zoom_out': 'ซูมออก',
  'canvas.reset': 'จัดกึ่งกลาง',
  'canvas.loading': 'กำลังโหลดแผนที่…',
  'canvas.help': 'ลากขวา/กลาง = เลื่อน · ล้อเมาส์ = ซูม · Space = หยุด/เล่น · 1–4 = ความเร็ว · Esc = เลือก',
  'disclaimer': 'ตัวเลขทั้งหมดเป็นค่าสมมติเพื่อการเล่นเกม ไม่ใช่ข้อมูลทางคลินิกหรือราคาจริง',
};

const en: Dict = {
  'app.title': 'Healthcare Empire',
  'app.subtitle': 'Care & Beyond',
  'top.day': 'Day {day}',
  'top.cash': 'Cash',
  'top.reputation': 'Reputation',
  'top.pause': 'Pause',
  'top.new_game': 'New game',
  'top.new_game_confirm': 'Start a new game? Current progress will be lost.',
  'top.new_game_sure': 'Click again to restart',
  'top.lang': 'ไทย',

  'tab.build': 'Build',
  'tab.hire': 'Hire',
  'tab.admit': 'Admit',
  'tab.locked': 'Unlocks in Phase 2',

  'tool.select': 'Select / pan',
  'tool.select.hint': 'Click a room to inspect it, drag to pan the map',
  'tool.corridor': 'Corridor',
  'tool.corridor.hint': 'Drag to lay corridor. Rooms must touch a corridor connected to the main entrance',
  'tool.bulldoze': 'Demolish',
  'tool.bulldoze.hint': 'Click a room or corridor to remove it. Refunds {pct}%',
  'tool.room.hint': 'Drag to size the room. Shortest side {minSide}, area {minArea}–{maxArea} tiles',
  'tool.per_tile': '/tile',
  'tool.base': 'base',

  'room.ward': 'Resident ward',
  'room.nursing_station': 'Nursing station',
  'room.therapy': 'Therapy room',
  'room.staff_room': 'Staff room',
  'room.ward.desc': 'Resident beds, one bed per 2 tiles',
  'room.nursing_station.desc': 'Coordination hub for the nursing team',
  'room.therapy.desc': 'Abstract mobility and rehabilitation space',
  'room.staff_room.desc': 'Staff break area for energy and morale',
  'room.corridor': 'Corridor',
  'room.entrance': 'Main entrance',
  'room.empty': 'Empty lot',

  'equip.care_bed': 'Adjustable bed',
  'equip.call_system': 'Call bell system',
  'equip.med_cart': 'Supply cart',
  'equip.nurse_desk': 'Nurse desk',
  'equip.exercise_mat': 'Exercise mat',
  'equip.parallel_bars': 'Walking bars',
  'equip.lockers': 'Lockers',
  'equip.rest_sofa': 'Rest sofa',

  'inspector.title': 'Inspector',
  'inspector.none': 'Select a room on the map to inspect it',
  'inspector.size': 'Size',
  'inspector.cells': '{w}×{h} ({area} tiles)',
  'inspector.status': 'Status',
  'inspector.operational': 'Operational',
  'inspector.not_operational': 'Not operational',
  'inspector.capacity': 'Capacity',
  'inspector.beds': '{n} beds',
  'inspector.equipment': 'Equipment',
  'inspector.required': 'required',
  'inspector.optional': 'optional',
  'inspector.demolish': 'Demolish room (refund {amount})',
  'inspector.upkeep': 'Daily upkeep',
  'inspector.cell': 'Tile ({x}, {y})',
  'issue.no_access': 'No access: connect a corridor from the main entrance to this room',
  'issue.missing_equipment': 'Missing {equipment} ({have}/{need})',

  'alerts.title': 'Alerts',
  'alerts.empty': 'No alerts yet',
  'log.room_built': '{room} completed',
  'log.room_demolished': '{room} demolished',
  'log.day_upkeep': 'Daily building upkeep paid',

  'dash.cash': 'Cash',
  'dash.invested': 'Invested',
  'dash.upkeep': 'Upkeep / day',
  'dash.rooms': 'Rooms operational',
  'dash.beds': 'Beds operational',
  'dash.occupancy': 'Occupancy',
  'dash.quality': 'Care quality',
  'dash.phase2': 'Phase 2',
  'dash.goals': 'Build goals',

  'goal.corridor': 'Lay at least 6 corridor tiles from the entrance',
  'goal.connected': 'Connect your first room to the corridor',
  'goal.beds': 'Open {n} operational beds',
  'goal.station': 'Open a nursing station',
  'goal.staff_room': 'Open a staff room',
  'goal.therapy': 'Open a therapy room',
  'goal.cash': 'Run 3+ operational rooms with positive cash',

  'reason.out_of_bounds': 'Outside the lot',
  'reason.too_small': 'Too small (shortest side {minSide}, area ≥ {minArea})',
  'reason.too_large': 'Too large (max {maxArea} tiles)',
  'reason.overlap': 'Overlaps another structure',
  'reason.insufficient_funds': 'Not enough cash',
  'reason.nothing_to_build': 'Corridor already there',
  'reason.not_found': 'Nothing to remove',
  'reason.cannot_remove_entrance': 'The main entrance cannot be removed',
  'reason.equipment_not_allowed': 'This equipment does not fit this room',
  'reason.equipment_limit': 'Maximum installed ({max})',
  'reason.equipment_none': 'Nothing to remove',
  'reason.equipment_required': 'Required equipment',
  'reason.invalid_speed': 'Invalid speed',
  'preview.ok': 'Valid',

  'ledger.capital': 'Starting capital',
  'ledger.construction_room': 'Built {room}',
  'ledger.construction_corridor': 'Laid {tiles} corridor tiles',
  'ledger.equipment': 'Bought {equipment}',
  'ledger.refund_room': 'Refund: demolished {room}',
  'ledger.refund_corridor': 'Refund: corridor tile',
  'ledger.refund_equipment': 'Refund: sold {equipment}',
  'ledger.upkeep': 'Building upkeep, day {day}',

  'canvas.zoom_in': 'Zoom in',
  'canvas.zoom_out': 'Zoom out',
  'canvas.reset': 'Recenter',
  'canvas.loading': 'Loading map…',
  'canvas.help': 'Right/middle drag = pan · Wheel = zoom · Space = pause · 1–4 = speed · Esc = select',
  'disclaimer': 'All figures are fictional game-balancing values, not clinical data or real prices.',
};

export const DICTS: Record<Lang, Dict> = { th, en };

/** Params whose values are themselves i18n keys (e.g. room type ids) are translated too. */
const PARAM_PREFIX: Record<string, string> = { room: 'room.', equipment: 'equip.' };

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[lang];
  let out = dict[key] ?? DICTS.th[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const prefix = PARAM_PREFIX[k];
      const value = prefix && typeof v === 'string' ? (dict[prefix + v] ?? String(v)) : String(v);
      out = out.split(`{${k}}`).join(value);
    }
  }
  return out;
}

export function localeOf(lang: Lang): string {
  return lang === 'th' ? 'th-TH' : 'en-US';
}
