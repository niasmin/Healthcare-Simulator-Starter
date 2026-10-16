import { STARTER_SCENARIO } from '../data/scenarios';
import { allRoomStatuses, type RoomStatus } from '../domain/rules/rooms';
import type { GameState, LedgerCategory, RoomType, Satang } from '../domain/types';
import { dailyUpkeep } from './systems/finance';

export interface SiteSummary {
  statuses: Map<string, RoomStatus>;
  roomsTotal: number;
  roomsOperational: number;
  bedsInstalled: number;
  bedsOperational: number;
  corridorTiles: number;
  dailyUpkeepSatang: Satang;
  spentByCategory: Record<LedgerCategory, Satang>;
  operationalByType: Record<RoomType, number>;
}

export function summarize(state: GameState): SiteSummary {
  const statuses = allRoomStatuses(state.site);
  let roomsOperational = 0;
  let bedsInstalled = 0;
  let bedsOperational = 0;
  const operationalByType: Record<RoomType, number> = { ward: 0, nursing_station: 0, therapy: 0, staff_room: 0 };
  for (const room of state.site.rooms) {
    const st = statuses.get(room.id)!;
    bedsInstalled += st.installedBeds;
    bedsOperational += st.capacity;
    if (st.operational) {
      roomsOperational++;
      operationalByType[room.type]++;
    }
  }
  const spentByCategory: Record<LedgerCategory, Satang> = { capital: 0, construction: 0, equipment: 0, refund: 0, upkeep: 0 };
  for (const e of state.ledger) spentByCategory[e.category] += e.amountSatang;
  return {
    statuses,
    roomsTotal: state.site.rooms.length,
    roomsOperational,
    bedsInstalled,
    bedsOperational,
    corridorTiles: state.site.corridor.reduce((a, b) => a + b, 0),
    dailyUpkeepSatang: dailyUpkeep(state),
    spentByCategory,
    operationalByType,
  };
}

export interface Objective {
  id: string;
  key: string;
  params?: Record<string, number>;
  done: boolean;
  progress?: { have: number; need: number };
}

/** First-milestone build goals, derived purely from state (no stored flags). */
export function buildObjectives(state: GameState, summary: SiteSummary = summarize(state)): Objective[] {
  const target = STARTER_SCENARIO.targetBeds;
  const connected = state.site.rooms.some((r) => summary.statuses.get(r.id)?.door);
  return [
    { id: 'corridor', key: 'goal.corridor', done: summary.corridorTiles >= 6, progress: { have: Math.min(summary.corridorTiles, 6), need: 6 } },
    { id: 'connected', key: 'goal.connected', done: connected },
    {
      id: 'beds',
      key: 'goal.beds',
      params: { n: target },
      done: summary.bedsOperational >= target,
      progress: { have: Math.min(summary.bedsOperational, target), need: target },
    },
    { id: 'station', key: 'goal.station', done: summary.operationalByType.nursing_station > 0 },
    { id: 'staff_room', key: 'goal.staff_room', done: summary.operationalByType.staff_room > 0 },
    { id: 'therapy', key: 'goal.therapy', done: summary.operationalByType.therapy > 0 },
    { id: 'cash', key: 'goal.cash', done: state.organization.cashSatang > 0 && summary.roomsOperational >= 3 },
  ];
}
