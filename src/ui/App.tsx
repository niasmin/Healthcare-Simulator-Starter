import { useShowIntro, WelcomeIntro } from './components/WelcomeIntro';
import { OwnerModal } from './components/OwnerModal';
import { StandardsModal } from './components/StandardsModal';
import { InventoryModal, useStockToasts } from './components/InventoryModal';
import { AccountModal } from './components/AccountModal';
import { useSound } from './sound';
import { useTelemetry } from './telemetry';
import { useAlerts } from './alerts';
import { ShopModal } from './components/ShopModal';
import { CityModal } from './components/CityModal';
import { GoalsModal, useGoalToasts } from './components/GoalsModal';
import { CommunityModal } from './components/CommunityModal';
import { AutoModal, AwayProgress, AwayReportModal } from './components/AutoModal';
import { useEffect } from 'react';
import { SaveModal } from './components/SaveModal';
import { ChaptersModal } from './components/ChaptersModal';
import { useAutosave, useSaveStatus } from './saveService';
import { EventModal } from './components/EventModal';
import { ChapterResultModal } from './components/ChapterResultModal';
import { TourSpotlight, TutorialCard, useTutorialToasts } from './components/Tutorial';
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
  useAlerts();
  useSound();
  useTelemetry();
  useKeyboard();
  const lang = useGame((s) => s.lang);
  const mobile = useIsMobile();
  useAutosave();
  useTutorialToasts();
  useGoalToasts();
  useStockToasts();
  const started = useGame((s) => s.started);
  const setStarted = useGame((s) => s.setStarted);
  const saveOpen = useGame((s) => s.saveOpen);
  const setSaveOpen = useGame((s) => s.setSaveOpen);
  const chaptersOpen = useGame((s) => s.chaptersOpen);
  const shopOpen = useGame((s) => s.shopOpen);
  const cityOpen = useGame((s) => s.cityOpen);
  const goalsOpen = useGame((s) => s.goalsOpen);
  const stockOpen = useGame((s) => s.stockOpen);
  const standardsOpen = useGame((s) => s.standardsOpen);
  const ownerOpen = useGame((s) => s.ownerOpen);
  const showIntro = useShowIntro();
  const communityOpen = useGame((s) => s.communityOpen);
  const autoOpen = useGame((s) => s.autoOpen);
  const accountOpen = useGame((s) => s.accountOpen);
  const recovering = useSaveStatus((s) => s.recovering);
  // Back from a password-reset email: ask for the new password straight away.
  useEffect(() => {
    if (recovering) useGame.getState().setAccountOpen(true);
  }, [recovering]);
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
      {started && <TourSpotlight />}
      {started && saveOpen && <SaveModal mode="game" onClose={() => setSaveOpen(false)} />}
      {chaptersOpen && <ChaptersModal onClose={() => setChaptersOpen(false)} />}
      {shopOpen && <ShopModal onClose={() => useGame.getState().setShopOpen(false)} />}
      {started && goalsOpen && <GoalsModal onClose={() => useGame.getState().setGoalsOpen(false)} />}
      {started && stockOpen && <InventoryModal onClose={() => useGame.getState().setStockOpen(false)} />}
      {started && standardsOpen && <StandardsModal onClose={() => useGame.getState().setStandardsOpen(false)} />}
      {showIntro && <WelcomeIntro />}
      {ownerOpen && <OwnerModal onClose={() => useGame.getState().setOwnerOpen(false)} />}
      {communityOpen && <CommunityModal tab={communityOpen} onClose={() => useGame.getState().setCommunityOpen(null)} />}
      {cityOpen && <CityModal tab={cityOpen} onClose={() => useGame.getState().setCityOpen(null)} />}
      {autoOpen && <AutoModal onClose={() => useGame.getState().setAutoOpen(false)} />}
      {accountOpen && <AccountModal onClose={() => useGame.getState().setAccountOpen(false)} />}
      <AwayProgress />
      <AwayReportModal />
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
  const view = useGame((s) => s.view);
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <main className="flex-1 min-h-0 grid gap-3 py-3 px-4 grid-cols-[250px_1fr_300px] grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
        <div className="min-h-0 flex flex-col">
          <LeftPanel />
        </div>
        <div className="min-h-0 flex flex-col relative">
          <CenterArea />
          {/* Keep the card off the entrance area of the map, where the first build steps happen. */}
          <div className={`absolute z-10 max-w-[calc(100%-1.5rem)] pointer-events-none ${view === 'map' ? 'left-3 top-14' : 'right-3 bottom-3'}`}>
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
