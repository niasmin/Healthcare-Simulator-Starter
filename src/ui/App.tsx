import { useEffect, useState } from 'react';
import { EventModal } from './components/EventModal';
import { TitleScreen } from './components/TitleScreen';
import { LeftPanel } from './components/BuildPanel';
import { Dashboard } from './components/Dashboard';
import { CenterArea } from './components/CenterArea';
import { SidePanel } from './components/Inspector';
import { MobileShell } from './components/MobileShell';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { useGameLoop, useIsMobile, useKeyboard } from './hooks';
import { useGame } from './store';

export function App() {
  useGameLoop();
  useKeyboard();
  const lang = useGame((s) => s.lang);
  const mobile = useIsMobile();
  const [started, setStarted] = useState(() => window.location.search.includes('skiptitle'));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const overlays = (
    <>
      <Toast />
      {started ? <EventModal /> : <TitleScreen onStart={() => setStarted(true)} />}
    </>
  );

  if (mobile)
    return (
      <>
        <MobileShell />
        {overlays}
      </>
    );

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <main className="flex-1 min-h-0 grid gap-3 py-3 px-4 grid-cols-[250px_1fr_300px] grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
        <div className="min-h-0 flex flex-col">
          <LeftPanel />
        </div>
        <div className="min-h-0 flex flex-col">
          <CenterArea />
        </div>
        <div className="min-h-0 flex flex-col">
          <SidePanel />
        </div>
        <div className="col-span-3">
          <Dashboard />
        </div>
      </main>
      {overlays}
    </div>
  );
}
