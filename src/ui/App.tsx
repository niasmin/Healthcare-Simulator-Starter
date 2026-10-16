import { useEffect, useState } from 'react';
import { EventModal } from './components/EventModal';
import { TitleScreen } from './components/TitleScreen';
import { LeftPanel } from './components/BuildPanel';
import { Dashboard } from './components/Dashboard';
import { CenterArea } from './components/CenterArea';
import { SidePanel } from './components/Inspector';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { useGameLoop, useKeyboard } from './hooks';
import { useGame } from './store';

export function App() {
  useGameLoop();
  useKeyboard();
  const lang = useGame((s) => s.lang);
  const [started, setStarted] = useState(() => window.location.search.includes('skiptitle'));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <main className="flex-1 min-h-0 grid gap-3 py-3 px-4 grid-cols-1 lg:grid-cols-[250px_1fr_300px] lg:grid-rows-[minmax(0,1fr)_auto] overflow-y-auto lg:overflow-hidden">
        <div className="lg:row-span-1 min-h-0 flex flex-col max-lg:order-2">
          <LeftPanel />
        </div>
        <div className="min-h-[60vh] lg:min-h-0 flex flex-col max-lg:order-1">
          <CenterArea />
        </div>
        <div className="min-h-0 flex flex-col max-lg:order-3">
          <SidePanel />
        </div>
        <div className="lg:col-span-3 max-lg:order-4">
          <Dashboard />
        </div>
      </main>
      <Toast />
      {started ? <EventModal /> : <TitleScreen onStart={() => setStarted(true)} />}
    </div>
  );
}
