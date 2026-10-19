import { useEffect } from 'react';
import { SaveModal } from './components/SaveModal';
import { ChaptersModal } from './components/ChaptersModal';
import { useAutosave } from './saveService';
import { EventModal } from './components/EventModal';
import { ChapterResultModal } from './components/ChapterResultModal';
import { TutorialCard, useTutorialToasts } from './components/Tutorial';
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
  useAutosave();
  useTutorialToasts();
  const started = useGame((s) => s.started);
  const setStarted = useGame((s) => s.setStarted);
  const saveOpen = useGame((s) => s.saveOpen);
  const setSaveOpen = useGame((s) => s.setSaveOpen);
  const chaptersOpen = useGame((s) => s.chaptersOpen);
  const setChaptersOpen = useGame((s) => s.setChaptersOpen);
  useEffect(() => {
    if (window.location.search.includes('skiptitle')) setStarted(true);
  }, [setStarted]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const overlays = (
    <>
      <Toast />
      {started ? <EventModal /> : <TitleScreen />}
      {started && <ChapterResultModal />}
      {started && saveOpen && <SaveModal mode="game" onClose={() => setSaveOpen(false)} />}
      {chaptersOpen && <ChaptersModal onClose={() => setChaptersOpen(false)} />}
    </>
  );

  // Overlays stay at a stable position in the tree so rotating a phone (layout switch) keeps them open.
  return (
    <>
      {mobile ? <MobileShell /> : <DesktopLayout />}
      {overlays}
    </>
  );
}

function DesktopLayout() {
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <main className="flex-1 min-h-0 grid gap-3 py-3 px-4 grid-cols-[250px_1fr_300px] grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
        <div className="min-h-0 flex flex-col">
          <LeftPanel />
        </div>
        <div className="min-h-0 flex flex-col relative">
          <CenterArea />
          <div className="absolute left-3 bottom-14 z-10 max-w-[calc(100%-1.5rem)] pointer-events-none">
            <TutorialCard />
          </div>
        </div>
        <div className="min-h-0 flex flex-col">
          <SidePanel />
        </div>
        <div className="col-span-3">
          <Dashboard />
        </div>
      </main>
    </div>
  );
}
