import { useEffect, useState } from 'react';
import { fmt } from '../game/game';
import { TICK_SECONDS } from '../game/simulation';
import { TUTORIAL_STEPS, TUTORIAL_TOTAL } from '../game/tutorial';
import { StepDots } from './TutorialVisual';
import { EduTaskBlock, HealthTaskBlock } from './Panels';
import { RuleBox } from './CivicPanels';
import { Icon } from './icons';
import { assetUrl, useGame, useScene } from './useGame';

/** Yuqori panel: logo, mablag‘, aholi, baxt, hisob davri, pauza, sozlamalar. */
export function TopBar() {
  const g = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const progress = Math.min(1, g.tickAccumulator / TICK_SECONDS);
  // HUD va «Shahar budjeti» paneli bir xil hisobdan (g.budget) foydalanadi
  const net = g.budget.net;
  return (
    <>
      <div className="logo" data-ui>
        <img className="logo-img" src={assetUrl('assets/brand/logo-384.png')} alt="Uzbek Jurassic Park" draggable={false} />
      </div>
      <div className="topbar" data-ui>
        <button className={'chip chip-btn panel-dark' + (g.money < 0 ? ' debt' : '') + (g.budgetOpen ? ' open' : '')} title={`Mablag‘: ${fmt(g.money)} — shahar budjetini ochish`}
          aria-label="Shahar budjeti" aria-expanded={g.budgetOpen} onClick={() => g.toggleBudget()} data-testid="money">
          <Icon.coin />
          <span className="chip-value money-full">{fmt(g.money)}</span>
          {/* tor telefonda qisqa (500K) — yuqori qator sig‘sin */}
          <span className="chip-value money-short">{shortMoney(g.money)}</span>
          {g.money < 0 && <span className="chip-tag">Qarz</span>}
        </button>
        <div className="chip panel-dark" title="Aholi" data-testid="population">
          <Icon.people />
          <span className="chip-value">{fmt(g.population)}</span>
        </div>
        <div className="chip panel-dark" title="Baxt" data-testid="happiness">
          <Icon.smile />
          <span className="chip-value">{g.happiness}%</span>
        </div>
        <button className="chip chip-btn panel-dark rep-chip" title="Reyting — bonuslar va jarimalar" aria-label="Reyting: bonuslar va jarimalar"
          onClick={() => g.openModal('rewards')} data-testid="reputation">
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="#ffc83d" stroke="#d99a00" strokeWidth="1.2" strokeLinejoin="round" /></svg>
          <span className="chip-value">{g.rewards.rep}</span>
        </button>
        <button className="chip chip-btn panel-dark tick-chip" title={`Hisob davri ${g.tickCount} (har ${TICK_SECONDS} soniya) — budjetni ochish`}
          aria-label="Davriy sof natija" onClick={() => g.toggleBudget()} data-testid="tick">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="10" stroke="#29466e" strokeWidth="4" fill="none" />
            <circle cx="13" cy="13" r="10" stroke="#22d3ee" strokeWidth="4" fill="none"
              strokeDasharray={`${progress * 62.8} 62.8`} transform="rotate(-90 13 13)" />
          </svg>
          <span className="chip-value small tick-label">Davr {g.tickCount}</span>
          <span className={'chip-delta ' + (net >= 0 ? 'pos' : 'neg')} data-testid="hud-net">{signed(net)}<span className="per-tick"> / davr</span></span>
        </button>
        <button className={'round-btn panel-dark' + (g.paused ? ' active' : '')} onClick={() => g.togglePause()}
          aria-label={g.paused ? 'Davom ettirish' : 'Pauza'} title={g.paused ? 'Davom ettirish (P)' : 'Pauza (P)'} data-testid="pause">
          {g.paused ? <Icon.play /> : <Icon.pause />}
        </button>
        <button className="round-btn panel-dark" onClick={() => g.openModal('settings')} aria-label="Sozlamalar" title="Sozlamalar" data-testid="settings">
          <Icon.gear />
        </button>
      </div>
      {g.paused && <div className="pause-badge" data-ui>Pauza — iqtisodiyot va aholi to‘xtatilgan</div>}
      {g.autosaveBlocked && <div className="warn-badge" data-ui>{g.autosaveBlockReason ?? 'Avtosaqlash o‘chiq'}</div>}
    </>
  );
}

/** Qisqa summa: 500K, 1,2M (tor ekran uchun) */
export function shortMoney(n: number): string {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + 'M';
  if (a >= 1e4) return s + Math.round(a / 1e3) + 'K';
  return s + fmt(a);
}

/** +120 / −873 / 0 ko‘rinishi */
export function signed(n: number): string {
  return (n > 0 ? '+' : '') + fmt(n);
}

/** Dastyor maslahati: ta’minotdagi eng muhim muammo (uy paneli va xarita belgilari bilan bir manbadan). */
export function DastyorAdvice() {
  const g = useGame();
  const a = g.advice;
  if (!a) return null;
  return <div className="advice" data-testid="advice"><Icon.warn size={16} /> {a}</div>;
}

/** Yig‘iladigan «Ta’minot» paneli: yo‘l / elektr / suv bilan ta’minlangan uylar soni. */
export function SupplyPanel() {
  const g = useGame();
  const [open, setOpen] = useState(true);
  const s = g.supply;
  const rows = [
    { key: 'road', label: 'Yo‘l', n: s.road, icon: <Icon.road size={20} /> },
    { key: 'power', label: 'Elektr', n: s.power, icon: <Icon.bolt size={20} /> },
    { key: 'water', label: 'Suv', n: s.water, icon: <Icon.drop size={20} /> },
  ];
  const problems = rows.filter((r) => r.n < s.houses).length;
  return (
    <div className="supply-panel panel" data-ui data-testid="supply-panel">
      <button className="panel-head" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="supply-toggle">
        <span className="head-icon"><Icon.wrench size={18} /></span>
        <span className="head-title">Ta’minot</span>
        {!open && <span className={'head-badge ' + (problems ? 'bad' : 'ok')}>{problems ? `${problems} muammo` : 'Joyida'}</span>}
        <span className={'head-chevron' + (open ? ' open' : '')}><Icon.chevron /></span>
      </button>
      {open && (
        <div className="supply-rows">
          {rows.map((r) => (
            <div key={r.key} className={'supply-row ' + r.key}>
              <span className="supply-ico">{r.icon}</span>
              <span className="supply-label">{r.label}</span>
              <b className={r.n < s.houses ? 'bad' : 'ok'} data-testid={'supply-' + r.key}>{r.n} / {s.houses} uy</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Chapdagi joriy topshiriq paneli (Dastyor oynasi ochiq bo‘lsa yashirinadi — u xuddi shu bosqichni ko‘rsatadi). */
export function TaskPanel() {
  const g = useGame();
  const t = g.tutorial;
  const step = Math.min(t.step, TUTORIAL_TOTAL - 1);
  if (g.dastyorOpen && !t.skipped) return null;
  return (
    <div className="task-panel panel" data-ui data-testid="task-panel">
      <div className="task-icon"><Icon.task /></div>
      <div className="task-body">
        {t.skipped ? (
          <>
            <div className="task-title">Erkin qurilish</div>
            <button className="link-btn" onClick={() => g.resumeTutorial()}>Yo‘riqnomani yoqish</button>
          </>
        ) : t.completed ? (
          <>
            <div className="task-title">Barakalla!</div>
            <StepDots step={TUTORIAL_TOTAL} completed />
          </>
        ) : (
          <>
            <div className="task-title">{TUTORIAL_STEPS[step].title}</div>
            <div className="task-text" data-testid="task-text">{TUTORIAL_STEPS[step].task}</div>
            <div className="progress-row">
              <StepDots step={t.step} completed={false} />
              <span data-testid="task-count">{t.step}/{TUTORIAL_TOTAL}</span>
            </div>
          </>
        )}
        {(t.completed || t.skipped) && <><EduTaskBlock /><HealthTaskBlock /><RuleBox compact /></>}
        <DastyorAdvice />
      </div>
      {!t.skipped && !g.dastyorOpen && (
        <button className="help-btn" onClick={() => g.reopenDastyor()} aria-label="Dastyorni ochish" title="Dastyorni ochish" data-testid="help">
          <Icon.help />
        </button>
      )}
    </div>
  );
}

export function CameraCompass() {
  const scene = useScene();
  const [, force] = useState(0);

  useEffect(() => {
    if (!scene) return;
    const id = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [scene]);

  const cam = scene?.cam.state;
  if (!scene || !cam) return null;

  const turn = (az: number) => scene.cam.orbit(az, 0);
  const zoom = (factor: number) => scene.cam.zoom(factor);

  return (
    <div className="camera-compass panel" data-ui aria-label="Kamera boshqaruvi">
      <div className="camera-compass-head">
        <span>Ko‘rinish</span>
        <button className="icon-btn small" onClick={() => scene.resetCamera()} title="Kamerani qaytarish">⟳</button>
      </div>
      <div className="camera-pad">
        <button className="cam-arrow" onClick={() => turn(-0.6)} title="Chapga burish">←</button>
        <button className="cam-arrow" onClick={() => turn(0.6)} title="O‘ngga burish">→</button>
        <button className="cam-arrow" onClick={() => zoom(1.12)} title="Yaqinlashtirish">＋</button>
        <button className="cam-arrow" onClick={() => zoom(0.9)} title="Uzoqlashtirish">－</button>
      </div>
      <div className="camera-distance">Masofa: {cam.distance.toFixed(0)}</div>
    </div>
  );
}
