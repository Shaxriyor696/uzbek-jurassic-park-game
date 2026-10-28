import { startAudio, stopAudio } from './audio';
import { introAbort, introSceneReady } from './audio/intro';
import { HALF } from './three/environment';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { BUSINESSES } from './game/businesses';
import { EDUCATION } from './game/educationDefs';
import { CONSTRUCTION } from './game/construction';

// Faqat avtomatik sinovlar uchun: ?test=1&instant — bino darhol tayyor (eski sinovlar shunga mo‘ljallangan)
{
  const q = new URLSearchParams(location.search);
  if (q.has('test') && q.has('instant')) CONSTRUCTION.enabled = false;
}
import { CATALOG } from './game/catalog';
import { Game } from './game/game';
import { readSave, SAVE_KEY } from './game/saveStore';
import { bindBackButton, gameStorage, initTelegramShell, telegramReady } from './telegram/telegram';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GameScene } from './three/scene';
import { CameraCompass, SupplyPanel, TaskPanel, TopBar } from './ui/Hud';
import { Modals } from './ui/Modals';
import { BudgetPanel, BuildMenu, Dastyor, HoverHint, InfoPanel, Toasts, EducationPanel, HealthPanel } from './ui/Panels';
import { DefensePanel } from './ui/DefensePanels';
import { PopulationPanel, VehiclePanel } from './ui/TrafficPanels';
import { GameContext, useGame, useScene } from './ui/useGame';

declare global {
  interface Window {
    __BOYOTA__?: { game: Game; scene: GameScene; audio: import('./audio/audioDirector').AudioDirector; catalog: typeof CATALOG; businessTypes: string[]; educationTypes: string[] };
  }
}

export function App() {
  const [game] = useState(() => Game.boot(gameStorage()));
  const [fatal, setFatal] = useState<string | null>(null);
  const [scene, setScene] = useState<GameScene | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let s: GameScene;
    try {
      s = new GameScene(hostRef.current!, game);
    } catch (e) {
      // WebGL yo‘q yoki xotira yetmadi — tushunarli xato va qayta urinish
      setFatal(String((e as Error)?.message ?? e));
      introAbort();
      telegramReady();
      return;
    }
    setScene(s);
    // Telegram: kengaytirish, xavfsiz hudud, fon rejimida pauza; «orqaga» — avval oyna/menyu yopiladi
    initTelegramShell((active) => game.setTabHidden(!active));
    const unbindBack = bindBackButton(
      () => !!game.modal || game.tool !== 'select' || !!game.selectedId || !!game.selectedVehicle || game.budgetOpen,
      () => {
        if (game.modal) game.openModal(null);
        else if (game.tool !== 'select') game.cancelTool();
        else if (game.selectedVehicle) game.selectVehicle(null);
        else if (game.selectedId) game.select(null);
        else if (game.budgetOpen) game.toggleBudget();
      },
    );
    telegramReady();
    // ovoz: birinchi bosish/klavishdan keyin yoqiladi; har kadr kamera va o‘yin holatidan
    const audio = startAudio(game);
    const audioHook = (dt: number) => audio.update(s.cam.state, HALF, dt);
    s.frameHooks.add(audioHook);
    // yuklanish ekrani (index.html) — sahna tayyor; intro bo‘kirishi/tanlovi holatiga qarab silliq yo‘qoladi
    introSceneReady();

    // Testlar (Playwright) uchun faqat ?test=1 bo‘lsa — o‘yinchi UI siga hech narsa qo‘shmaydi.
    if (new URLSearchParams(location.search).has('test')) window.__BOYOTA__ = { game, scene: s, audio, catalog: CATALOG, businessTypes: BUSINESSES.map((b) => b.type), educationTypes: EDUCATION.map((e) => e.type) };
    // Faqat dev rejimida: ?pul=2000000 — shahar pulini o‘rnatadi, saqlaydi va parametrni manzildan olib tashlaydi.
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(location.search);
      const pul = Number(q.get('pul'));
      if (q.has('pul') && Number.isFinite(pul) && pul >= 0) {
        game.money = Math.floor(pul);
        game.saveNow(true);
        game.emit();
        q.delete('pul');
        history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
      }
    }
    const flush = () => game.saveNow(false);
    window.addEventListener('pagehide', flush);
    // Boshqa tab shaharni saqlasa — shu tab ham o‘sha holatni yuklaydi (eski tab yangi saqlashni ustidan yozmasin).
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SAVE_KEY || !e.newValue) return;
      const r = readSave(gameStorage());
      if (r.status !== 'ok') return;
      game.applySave(r.data);
      game.emit(true);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', flush);
      s.frameHooks.delete(audioHook);
      unbindBack();
      stopAudio();
      s.dispose();
    };
  }, [game]);

  if (fatal) return <FatalScreen message={fatal} />;
  return (
    <ErrorBoundary>
      <GameContext.Provider value={{ game, scene }}>
        <Shell hostRef={hostRef} />
      </GameContext.Provider>
    </ErrorBoundary>
  );
}

/** Tushunarli xato va qayta urinish (shahar saqlangan — qayta ochilganda joyidan davom etadi) */
function FatalScreen({ message }: { message: string }) {
  return (
    <div className="fatal" role="alert">
      <h2>O‘yin ochilmadi</h2>
      <p>Qurilmangiz 3D grafikani (WebGL) ishga tushira olmadi yoki xotira yetmadi. Shahringiz saqlangan — qayta urinib ko‘ring.</p>
      <small>{message}</small>
      <button className="btn-primary" onClick={() => location.reload()}>Qayta urinish</button>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e?.message ?? String(e) }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('[ui]', e, info.componentStack); }
  render() { return this.state.error ? <FatalScreen message={this.state.error} /> : this.props.children; }
}

/**
 * UI joylashuvi: chap ustun (topshiriq, ta’minot, Dastyor) va o‘ng ustun (uy/budjet paneli, kamera)
 * flex ustunlar — panellar bir-birining ustiga chiqmaydi, joy yetmasa ichida aylanadi.
 */
function Shell({ hostRef }: { hostRef: RefObject<HTMLDivElement> }) {
  const g = useGame();
  const side = g.budgetOpen || (g.tool === 'select' && !!g.selectedId);
  // telefon (tor ekran): chap ustun panellari xaritani yopmasin — tugma bilan ochiladi
  const [panelsOpen, setPanelsOpen] = useState(false);
  const scene = useScene();
  // Dastyor tanishtiruvi — xarita (sahna) tayyor bo‘lgach: yangi shahar yoki shu qurilmada o‘yin birinchi ochilganda (bir marta).
  // Avtomatik sinovlar (?test) xaritani bosadi — tanishtiruv faqat ?onboarding bilan ochiladi.
  useEffect(() => {
    if (!scene || !g.onboardingDue || g.modal) return;
    const q = new URLSearchParams(location.search);
    if (!q.has('test') || q.has('onboarding')) g.startOnboarding(false);
  }, [scene, g, g.onboardingDue, g.modal]);
  // tanishtiruv tugadi — telefonda Dastyorning birinchi topshirig‘i ko‘rinsin (chap ustun ochiladi)
  useEffect(() => { if (g.dastyorFocus > 0) setPanelsOpen(true); }, [g.dastyorFocus]);
  return (
    <div className={'app' + (side ? ' has-side' : '') + (panelsOpen ? ' panels-open' : '')}>
      <div ref={hostRef} className="scene-host" />
      <div className="ui-layer">
        <TopBar />
        <button className="panels-toggle panel" data-ui onClick={() => setPanelsOpen((v) => !v)} aria-expanded={panelsOpen}>
          {panelsOpen ? '✕ Yopish' : '📋 Panellar'}
        </button>
        <div className="left-col">
          {/* panellar aylanadi; Dastyor pastda doim to‘liq ko‘rinadi */}
          <div className="left-scroll">
            <TaskPanel />
            <SupplyPanel />
            <EducationPanel />
            <HealthPanel />
            <PopulationPanel />
            <DefensePanel />
          </div>
          <Dastyor />
        </div>
        <div className="right-col">
          <VehiclePanel />
          <InfoPanel />
          <BudgetPanel />
          <div className="col-spacer" />
          <CameraCompass />
        </div>
        <BuildMenu />
        <Toasts />
        <Modals />
      </div>
      <HoverHint />
    </div>
  );
}
