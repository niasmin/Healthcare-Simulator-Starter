import { useT } from '../hooks';
import { useGame, type View } from '../store';
import { lazy, Suspense } from 'react';

// The map (and Pixi with it) loads separately, after the title screen and panels are up.
const GameCanvas = lazy(() => import('./GameCanvas').then((m) => ({ default: m.GameCanvas })));
import { ResidentsView } from './ResidentsView';
import { RosterView } from './RosterView';
import { FinanceView } from './FinanceView';

/** Map / Residents / Shift schedule. The Pixi canvas stays mounted underneath so it keeps its camera. */
export function CenterArea({ showTabs = true }: { showTabs?: boolean }) {
  const t = useT();
  const view = useGame((s) => s.view);
  const setView = useGame((s) => s.setView);
  const residents = useGame((s) => s.game.residents.length);
  const staff = useGame((s) => s.game.employees.length);
  const tabs: { id: View; label: string; count?: number }[] = [
    { id: 'map', label: t('view.map') },
    { id: 'residents', label: t('view.residents'), count: residents },
    { id: 'roster', label: t('view.roster'), count: staff },
    { id: 'finance', label: t('view.finance') },
  ];
  return (
    <div className={`flex flex-col h-full overflow-hidden ${showTabs ? 'panel min-h-[420px] lg:min-h-0' : ''}`}>
      <div className={`${showTabs ? "flex" : "hidden"} gap-1 p-1.5 border-b border-line bg-paper overflow-x-auto`} role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            data-tour={`view-${x.id}`}
            aria-selected={view === x.id}
            onClick={() => setView(x.id)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${view === x.id ? 'bg-ink text-white font-semibold' : 'text-ink-soft hover:bg-sand'}`}
          >
            {x.label}
            {x.count !== undefined && <span className={`ml-1.5 text-[11px] tabular ${view === x.id ? 'text-white/70' : 'text-ink-soft/70'}`}>{x.count}</span>}
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-h-0">
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-ink-soft text-sm">…</div>}>
          <GameCanvas controls={showTabs} />
        </Suspense>
        {view !== 'map' && (
          <div className="absolute inset-0 z-10 overflow-y-auto scroll-thin bg-[#f3efe6]">{view === 'residents' ? <ResidentsView /> : view === 'roster' ? <RosterView /> : <FinanceView />}</div>
        )}
      </div>
    </div>
  );
}
