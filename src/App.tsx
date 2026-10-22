import { startAudio, stopAudio } from './audio';
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
import { getBrowserStorage, readSave, SAVE_KEY } from './game/saveStore';
import { GameScene } from './three/scene';
import { CameraCompass, SupplyPanel, TaskPanel, TopBar } from './ui/Hud';
import { Modals } from './ui/Modals';
import { BudgetPanel, BuildMenu, Dastyor, HoverHint, InfoPanel, Toasts, EducationPanel, HealthPanel } from './ui/Panels';
import { DefensePanel } from './ui/DefensePanels';
import { PopulationPanel, VehiclePanel } from './ui/TrafficPanels';
import { GameContext, useGame } from './ui/useGame';

declare global {
  interface Window {
    __BOYOTA__?: { game: Game; scene: GameScene; audio: import('./audio/audioDirector').AudioDirector; catalog: typeof CATALOG; businessTypes: string[]; educationTypes: string[] };
  }
}

export function App() {
  const [game] = useState(() => Game.boot(getBrowserStorage()));
  const [scene, setScene] = useState<GameScene | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = new GameScene(hostRef.current!, game);
    setScene(s);
    // ovoz: birinchi bosish/klavishdan keyin yoqiladi; har kadr kamera va o‘yin holatidan
    const audio = startAudio(game);
    const audioHook = (dt: number) => audio.update(s.cam.state, HALF, dt);
    s.frameHooks.add(audioHook);
    // yuklanish ekrani (index.html) — sahna tayyor, silliq yo‘qoladi
    const splash = document.getElementById('splash');
    if (splash) { requestAnimationFrame(() => splash.classList.add('hide')); setTimeout(() => splash.remove(), 700); }
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
      const r = readSave(getBrowserStorage());
      if (r.status !== 'ok') return;
      game.applySave(r.data);
      game.emit(true);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', flush);
      s.frameHooks.delete(audioHook);
      stopAudio();
      s.dispose();
    };
  }, [game]);

  return (
    <GameContext.Provider value={{ game, scene }}>
      <Shell hostRef={hostRef} />
    </GameContext.Provider>
  );
}

/**
 * UI joylashuvi: chap ustun (topshiriq, ta’minot, Dastyor) va o‘ng ustun (uy/budjet paneli, kamera)
 * flex ustunlar — panellar bir-birining ustiga chiqmaydi, joy yetmasa ichida aylanadi.
 */
function Shell({ hostRef }: { hostRef: RefObject<HTMLDivElement> }) {
  const g = useGame();
  const side = g.budgetOpen || (g.tool === 'select' && !!g.selectedId);
  return (
    <div className={'app' + (side ? ' has-side' : '')}>
      <div ref={hostRef} className="scene-host" />
      <div className="ui-layer">
        <TopBar />
        <div className="left-col">
          <TaskPanel />
          <SupplyPanel />
          <EducationPanel />
          <HealthPanel />
          <PopulationPanel />
          <DefensePanel />
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
